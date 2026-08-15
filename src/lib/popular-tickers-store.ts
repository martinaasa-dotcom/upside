import { fetchMonthlyPopularTickers } from "@/lib/market/popular-tickers-fetch";
import {
  currentPopularMonth,
  sanitizePopularTickers,
  type PopularTickersPayload,
} from "@/lib/popular-tickers";
import type { AppSupabaseClient } from "@/lib/supabase/server";
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
