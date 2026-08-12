/**
 * Quote fallback chain — Yahoo (primary, free, no key) -> Twelve Data
 * (optional, free tier, needs TWELVE_DATA_API_KEY) -> Finnhub (optional,
 * free tier, needs FINNHUB_API_KEY) -> synthetic placeholder (absolute
 * last resort, keeps the UI usable instead of blank).
 *
 * Every tier here stays on a free tier — no paid market-data plan required.
 * Add a fallback provider simply by getting its free API key and setting
 * the env var; the app works fine today with none of them configured.
 */
import { fallbackQuotes, fetchFxOnly, fetchQuotesYahoo, type QuotesResult } from "@/lib/market/yahoo";
import { fetchQuotesTwelveData, twelveDataConfigured } from "@/lib/market/providers/twelvedata";
import { fetchQuotesFinnhub, finnhubConfigured } from "@/lib/market/providers/finnhub";
import type { Quote } from "@/lib/types";

export { fetchFxOnly };

export type QuotesResultWithSource = QuotesResult & {
  /** Which tier ultimately priced each ticker — surfaced for debugging/UI. */
  sources: Record<string, "yahoo" | "twelvedata" | "finnhub" | "synthetic">;
};

export async function fetchQuotesWithFallback(
  tickers: string[]
): Promise<QuotesResultWithSource> {
  const unique = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  const sources: QuotesResultWithSource["sources"] = {};
  if (unique.length === 0) {
    return {
      quotes: {},
      fx: { eurUsd: null, eurUsdOpen: null, eurUsdPreviousClose: null, eurUsdLast: null, gbpUsd: null },
      delayed: false,
      sources,
    };
  }

  const yahoo = await fetchQuotesYahoo(unique);
  const quotes: Record<string, Quote> = { ...yahoo.quotes };
  for (const t of unique) if (quotes[t]) sources[t] = "yahoo";

  let stillMissing = yahoo.failed;

  if (stillMissing.length > 0 && twelveDataConfigured()) {
    const fromTwelveData = await fetchQuotesTwelveData(stillMissing);
    for (const [ticker, q] of Object.entries(fromTwelveData)) {
      quotes[ticker] = q;
      sources[ticker] = "twelvedata";
    }
    stillMissing = stillMissing.filter((t) => !fromTwelveData[t]);
  }

  if (stillMissing.length > 0 && finnhubConfigured()) {
    const fromFinnhub = await fetchQuotesFinnhub(stillMissing);
    for (const [ticker, q] of Object.entries(fromFinnhub)) {
      quotes[ticker] = q;
      sources[ticker] = "finnhub";
    }
    stillMissing = stillMissing.filter((t) => !fromFinnhub[t]);
  }

  let delayed = stillMissing.length > 0;
  if (stillMissing.length > 0) {
    const synthetic = fallbackQuotes(stillMissing);
    for (const [ticker, q] of Object.entries(synthetic)) {
      quotes[ticker] = q;
      sources[ticker] = "synthetic";
    }
  }
  // Any real fallback tier kicking in still means Yahoo itself degraded —
  // keep surfacing `delayed` so the UI's stale-quotes banner still fires.
  if (Object.values(sources).some((s) => s !== "yahoo")) delayed = true;

  return { quotes, fx: yahoo.fx, delayed, sources };
}
