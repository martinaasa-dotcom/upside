import {
  currentPopularMonth,
  sanitizePopularTickers,
  type PopularTickersPayload,
} from "@/lib/popular-tickers";
import type { AppSupabaseClient } from "@/lib/supabase/client-types";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

type PopularRow = {
  month: string;
  tickers: unknown;
};

export async function readPopularTickers(
  supabase: AppSupabaseClient,
  month: string
): Promise<string[] | null> {
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.popularTickers)
    .select("month, tickers")
    .eq("month", month)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as PopularRow;
  const tickers = sanitizePopularTickers(row.tickers);
  return tickers.length > 0 ? tickers : null;
}

/**
 * This month's row, or the generic fallback. Never pulls Yahoo.
 * The monthly cron writes the live list; the Edge GET only reads.
 */
export async function loadStoredPopularTickers(
  supabase: AppSupabaseClient | null
): Promise<PopularTickersPayload> {
  const month = currentPopularMonth();
  if (!supabase) {
    return {
      month,
      tickers: sanitizePopularTickers(null),
      source: "fallback",
    };
  }
  const stored = await readPopularTickers(supabase, month);
  if (stored) return { month, tickers: stored, source: "month" };
  return {
    month,
    tickers: sanitizePopularTickers(null),
    source: "fallback",
  };
}
