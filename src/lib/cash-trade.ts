import type { SupabaseClient } from "@supabase/supabase-js";
import { tracksTradeCash } from "@/lib/cash-balance";
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
  const n = Number(data.cash_balance);
  return Number.isFinite(n) ? roundMoney(n) : null;
}

export async function portfolioTracksTradeCash(
  supabase: SupabaseClient,
  portfolioId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("classroom_community_id")
    .eq("id", portfolioId)
    .maybeSingle();
  if (error || !data) return false;
  return tracksTradeCash(data as { classroom_community_id?: string | null });
}

/** Buy/sell cash only moves on a classroom paper sheet. */
export async function applyTradeCashDelta(
  supabase: SupabaseClient,
  portfolioId: string,
  delta: number
): Promise<number | null> {
  if (!(await portfolioTracksTradeCash(supabase, portfolioId))) {
    return readCashBalance(supabase, portfolioId);
  }
  return applyPortfolioCashDelta(supabase, portfolioId, delta);
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
 * Callers must have already established co-ownership. The RPC also checks
 * co-ownership itself when the caller has a user JWT, so a stray PostgREST
 * call cannot move another sheet's cash. service_role skips that check
 * because auth.uid() is null on that connection.
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

  if (error) {
    console.error("[cash] portfell_apply_cash_delta failed", error.message);
    return null;
  }
  const n = Number(data);
  return Number.isFinite(n) ? roundMoney(n) : null;
}
