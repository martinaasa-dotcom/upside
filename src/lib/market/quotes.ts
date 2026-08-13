/**
 * Quote fallback chain — Yahoo (primary, free, no key) -> Twelve Data
 * (optional, free tier, needs TWELVE_DATA_API_KEY) -> Finnhub (optional,
 * free tier, needs FINNHUB_API_KEY).
 *
 * Missing names stay missing. The client keeps the last real cached
 * price instead of inventing one. A hole in the table beats a fake NAV.
 */
import { fetchFxOnly, fetchQuotesYahoo, type QuotesResult } from "@/lib/market/yahoo";
import { fetchQuotesTwelveData, twelveDataConfigured } from "@/lib/market/providers/twelvedata";
import { fetchQuotesFinnhub, finnhubConfigured } from "@/lib/market/providers/finnhub";
import type { Quote } from "@/lib/types";

export { fetchFxOnly };

export type QuotesResultWithSource = QuotesResult & {
  /** Which tier ultimately priced each ticker — surfaced for debugging/UI. */
  sources: Record<string, "yahoo" | "twelvedata" | "finnhub">;
  /** Tickers no provider could price. Client should keep last known mark. */
  missing: string[];
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
      missing: [],
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

  const delayed =
    stillMissing.length > 0 ||
    Object.values(sources).some((s) => s !== "yahoo");

  return { quotes, fx: yahoo.fx, delayed, sources, missing: stillMissing };
}
