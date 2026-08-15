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

export async function applyPortfolioCashDelta(
  supabase: SupabaseClient,
  portfolioId: string,
  delta: number
): Promise<number | null> {
  if (!Number.isFinite(delta) || delta === 0) {
    const { data } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .select("cash_balance")
      .eq("id", portfolioId)
      .maybeSingle();
    const n = Number((data as { cash_balance?: number } | null)?.cash_balance);
    return Number.isFinite(n) ? n : null;
  }
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("cash_balance")
    .eq("id", portfolioId)
    .maybeSingle();
  if (error || !data) return null;
  const next = roundMoney(
    Number((data as { cash_balance: number }).cash_balance) + delta
  );
  const { error: uErr } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .update({
      cash_balance: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", portfolioId);
  if (uErr) return null;
  return next;
}
