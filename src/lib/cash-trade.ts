import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchQuotesWithFallback } from "@/lib/market/quotes";
import { roundMoney } from "@/lib/money";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export { importCashDelta, tradeCashDelta } from "@/lib/cash-delta";

export async function salePriceFor(
  ticker: string,
  fallback: number
): Promise<number> {
  const fb = roundMoney(fallback);
  try {
    const { quotes } = await fetchQuotesWithFallback([ticker]);
    const p = quotes[ticker.trim().toUpperCase()]?.price;
    if (typeof p === "number" && p > 0) return roundMoney(p);
  } catch {
    /* use what they paid */
  }
  return fb;
}

async function readCashBalance(
  supabase: SupabaseClient,
  portfolioId: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("cash_balance")
    .eq("id", portfolioId)
    .maybeSingle();
  if (error || !data) return null;
  const n = Number((data as { cash_balance?: number }).cash_balance);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

/**
 * Move a sheet's cash by `delta` and return the new balance.
 *
 * The arithmetic happens inside Postgres (see migration 041). It used to be a
 * SELECT, add in Node, then UPDATE the absolute result, which loses one of two
 * concurrent deltas: both callers read the same starting balance and the
 * second UPDATE overwrites the first. Co-owned sheets, batch imports and
 * client retries all produce that overlap in normal use, and the symptom is a
 * cash balance quietly missing one trade.
 *
 * Callers must have already established co-ownership. The RPC does no
 * permission check of its own.
 */
export async function applyPortfolioCashDelta(
  supabase: SupabaseClient,
  portfolioId: string,
  delta: number
): Promise<number | null> {
  if (!Number.isFinite(delta) || delta === 0) {
    return readCashBalance(supabase, portfolioId);
  }

  const { data, error } = await supabase.rpc("portfell_apply_cash_delta", {
    p_portfolio_id: portfolioId,
    p_delta: roundMoney(delta),
  });

  if (!error) {
    const n = Number(data);
    return Number.isFinite(n) ? roundMoney(n) : null;
  }

  // An environment that hasn't run migration 041 yet still has to be able to
  // trade. Fall back to the old read-modify-write, which is racy but correct
  // for a single writer, rather than failing the trade outright.
  console.warn(
    "[cash] portfell_apply_cash_delta unavailable, falling back to read-modify-write",
    error.message
  );
  const current = await readCashBalance(supabase, portfolioId);
  if (current === null) return null;
  const next = roundMoney(current + delta);
  const { error: uErr } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .update({ cash_balance: next, updated_at: new Date().toISOString() })
    .eq("id", portfolioId);
  if (uErr) return null;
  return next;
}
