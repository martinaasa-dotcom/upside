import { fetchMonthlyPopularTickers } from "@/lib/market/popular-tickers-fetch";
import {
  currentPopularMonth,
  sanitizePopularTickers,
  type PopularTickersPayload,
} from "@/lib/popular-tickers";
import { readPopularTickers } from "@/lib/popular-tickers-read";
import type { AppSupabaseClient } from "@/lib/supabase/client-types";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export { readPopularTickers } from "@/lib/popular-tickers-read";

export async function writePopularTickers(
  supabase: AppSupabaseClient,
  month: string,
  tickers: string[]
): Promise<void> {
  const { error } = await supabase.from(PORTFELL_TABLES.popularTickers).upsert(
    {
      month,
      tickers,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "month" }
  );
  if (error) throw error;
}

export async function refreshPopularTickers(
  supabase: AppSupabaseClient
): Promise<PopularTickersPayload> {
  const month = currentPopularMonth();
  const tickers = await fetchMonthlyPopularTickers();
  await writePopularTickers(supabase, month, tickers);
  return { month, tickers, source: "live" };
}

/** Current month from the table, or a fresh Yahoo pull if this month is empty. */
export async function loadPopularTickers(
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
  try {
    return await refreshPopularTickers(supabase);
  } catch (err) {
    console.error("[popular-tickers] live refresh failed", err);
    return {
      month,
      tickers: sanitizePopularTickers(null),
      source: "fallback",
    };
  }
}
