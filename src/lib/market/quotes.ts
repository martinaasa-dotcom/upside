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
import { normalizeYahooTicker } from "@/lib/ticker";
import type { Quote } from "@/lib/types";

export { fetchFxOnly };

function aliasResolvedQuotes(
  requested: string[],
  quotes: Record<string, Quote>,
  sources: QuotesResultWithSource["sources"]
) {
  for (const req of requested) {
    if (quotes[req]) continue;
    const resolved = normalizeYahooTicker(req);
    if (!resolved || resolved === req || !quotes[resolved]) continue;
    quotes[req] = { ...quotes[resolved], ticker: req };
    if (sources[resolved]) sources[req] = sources[resolved];
  }
}

function unresolvedSymbols(
  requested: string[],
  quotes: Record<string, Quote>
): string[] {
  return [
    ...new Set(
      requested
        .filter((t) => !quotes[t] && !quotes[normalizeYahooTicker(t)])
        .map((t) => normalizeYahooTicker(t))
        .filter(Boolean)
    ),
  ];
}

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
  aliasResolvedQuotes(unique, quotes, sources);

  let stillMissing = unresolvedSymbols(unique, quotes);

  if (stillMissing.length > 0 && twelveDataConfigured()) {
    const fromTwelveData = await fetchQuotesTwelveData(stillMissing);
    for (const [ticker, q] of Object.entries(fromTwelveData)) {
      quotes[ticker] = q;
      sources[ticker] = "twelvedata";
    }
    aliasResolvedQuotes(unique, quotes, sources);
    stillMissing = unresolvedSymbols(unique, quotes);
  }

  if (stillMissing.length > 0 && finnhubConfigured()) {
    const fromFinnhub = await fetchQuotesFinnhub(stillMissing);
    for (const [ticker, q] of Object.entries(fromFinnhub)) {
      quotes[ticker] = q;
      sources[ticker] = "finnhub";
    }
    aliasResolvedQuotes(unique, quotes, sources);
    stillMissing = unresolvedSymbols(unique, quotes);
  }

  const delayed =
    stillMissing.length > 0 ||
    Object.values(sources).some((s) => s !== "yahoo");

  return {
    quotes,
    fx: yahoo.fx,
    delayed,
    sources,
    missing: unique.filter((t) => !quotes[t]),
  };
}
