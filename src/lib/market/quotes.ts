/**
 * Quote fallback chain — Yahoo (primary, free, no key) -> Twelve Data
 * (optional, free tier, needs TWELVE_DATA_API_KEY) -> Finnhub (optional,
 * free tier, needs FINNHUB_API_KEY) -> last-known cache (memory + Supabase).
 *
 * Missing names stay missing. The client keeps the last real cached
 * price instead of inventing one. A hole in the table beats a fake NAV.
 */
import { fetchFxOnly as fetchFxYahoo, fetchQuotesYahoo, type FxRates, type QuotesResult } from "@/lib/market/yahoo";
import { downsampleSparkline } from "@/lib/market/sparkline";
import { yahooQuoteCandidates } from "@/lib/ticker";
import type { Quote } from "@/lib/types";
import { sanitizeQuote } from "@/lib/market/quote-sanitize";
import { recallFx, recallQuotes, rememberFx, rememberQuotes } from "@/lib/market/quote-store";

function quoteForRequested(
  quotes: Record<string, Quote>,
  requested: string
): Quote | undefined {
  if (quotes[requested]) return quotes[requested];
  for (const candidate of yahooQuoteCandidates(requested)) {
    if (quotes[candidate]) return quotes[candidate];
  }
  return undefined;
}

function aliasResolvedQuotes(
  requested: string[],
  quotes: Record<string, Quote>,
  sources: QuotesResultWithSource["sources"]
) {
  for (const req of requested) {
    if (quotes[req]) continue;
    const hit = quoteForRequested(quotes, req);
    if (!hit) continue;
    quotes[req] = { ...hit, ticker: req };
    const sourceKey = [req, ...yahooQuoteCandidates(req)].find((key) => sources[key]);
    if (sourceKey) sources[req] = sources[sourceKey];
  }
}

function unresolvedSymbols(
  requested: string[],
  quotes: Record<string, Quote>
): string[] {
  return [...new Set(requested.filter((t) => !quoteForRequested(quotes, t)))];
}

function ingestLive(
  incoming: Record<string, Quote>,
  lastKnown: Record<string, Quote>,
  quotes: Record<string, Quote>,
  sources: QuotesResultWithSource["sources"],
  source: Exclude<QuotesResultWithSource["sources"][string], "cache">
) {
  const kept: Record<string, Quote> = {};
  for (const [ticker, raw] of Object.entries(incoming)) {
    const clean = sanitizeQuote(raw, lastKnown[ticker] ?? quotes[ticker] ?? null);
    if (!clean) continue;
    quotes[ticker] = clean;
    sources[ticker] = source;
    kept[ticker] = clean;
  }
  return kept;
}

function mergeCached(
  tickers: string[],
  cached: Record<string, Quote>,
  quotes: Record<string, Quote>,
  sources: QuotesResultWithSource["sources"]
) {
  for (const ticker of tickers) {
    if (quoteForRequested(quotes, ticker)) continue;
    const hit = quoteForRequested(cached, ticker);
    if (!hit) continue;
    quotes[ticker] = { ...hit, ticker, stale: true };
    sources[ticker] = "cache";
  }
}

function fxLooksLive(fx: FxRates): boolean {
  return (
    (fx.eurUsd != null && fx.eurUsd > 0) ||
    (fx.gbpUsd != null && fx.gbpUsd > 0) ||
    Object.values(fx.usdPer).some((n) => n > 0)
  );
}

export type QuotesResultWithSource = QuotesResult & {
  /** Which tier ultimately priced each ticker — surfaced for debugging/UI. */
  sources: Record<string, "yahoo" | "twelvedata" | "finnhub" | "cache">;
  /** Tickers no provider could price. Client should keep last known mark. */
  missing: string[];
  /** Epoch ms of the oldest print in this payload (live or cached). */
  updatedAt: number;
};

const EMPTY_FX: FxRates = {
  eurUsd: null,
  eurUsdOpen: null,
  eurUsdPreviousClose: null,
  eurUsdLast: null,
  gbpUsd: null,
  usdPer: {},
};

export async function fetchFxOnly(): Promise<FxRates> {
  const live = await fetchFxYahoo();
  if (fxLooksLive(live)) {
    rememberFx(live);
    return live;
  }
  const cached = await recallFx();
  return cached?.rates ?? live ?? EMPTY_FX;
}

export async function fetchQuotesWithFallback(
  tickers: string[]
): Promise<QuotesResultWithSource> {
  const unique = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  const sources: QuotesResultWithSource["sources"] = {};
  const now = Date.now();
  if (unique.length === 0) {
    return {
      quotes: {},
      fx: { ...EMPTY_FX },
      delayed: false,
      sources,
      missing: [],
      updatedAt: now,
    };
  }

  const lastKnown = await recallQuotes(unique);
  const yahoo = await fetchQuotesYahoo(unique);
  const quotes: Record<string, Quote> = {};
  ingestLive(yahoo.quotes, lastKnown, quotes, sources, "yahoo");
  aliasResolvedQuotes(unique, quotes, sources);

  let stillMissing = unresolvedSymbols(unique, quotes);

  if (stillMissing.length > 0) {
    const { fetchQuotesTwelveData, twelveDataConfigured } = await import(
      "@/lib/market/providers/twelvedata"
    );
    if (twelveDataConfigured()) {
      const fromTwelveData = await fetchQuotesTwelveData(stillMissing);
      ingestLive(fromTwelveData, lastKnown, quotes, sources, "twelvedata");
      aliasResolvedQuotes(unique, quotes, sources);
      stillMissing = unresolvedSymbols(unique, quotes);
    }
  }

  if (stillMissing.length > 0) {
    const { fetchQuotesFinnhub, finnhubConfigured } = await import(
      "@/lib/market/providers/finnhub"
    );
    if (finnhubConfigured()) {
      const fromFinnhub = await fetchQuotesFinnhub(stillMissing);
      ingestLive(fromFinnhub, lastKnown, quotes, sources, "finnhub");
      aliasResolvedQuotes(unique, quotes, sources);
      stillMissing = unresolvedSymbols(unique, quotes);
    }
  }

  const liveQuotes: Record<string, Quote> = {};
  for (const [ticker, q] of Object.entries(quotes)) {
    if (!q.stale) liveQuotes[ticker] = q;
  }
  if (Object.keys(liveQuotes).length > 0) {
    rememberQuotes(liveQuotes, now);
  }

  if (stillMissing.length > 0) {
    mergeCached(stillMissing, lastKnown, quotes, sources);
    aliasResolvedQuotes(unique, quotes, sources);
    stillMissing = unresolvedSymbols(unique, quotes);
  }

  let fx = yahoo.fx;
  if (fxLooksLive(fx)) {
    rememberFx(fx, now);
  } else {
    const cachedFx = await recallFx();
    if (cachedFx) fx = cachedFx.rates;
  }

  const delayed =
    stillMissing.length > 0 ||
    Object.values(quotes).some((q) => q.stale) ||
    Object.values(sources).some((s) => s !== "yahoo");

  let updatedAt = now;
  for (const q of Object.values(quotes)) {
    q.sparkline = downsampleSparkline(q.sparkline);
    if (typeof q.quotedAt === "number" && q.quotedAt > 0) {
      updatedAt = Math.min(updatedAt, q.quotedAt);
    }
  }
  if (Object.values(quotes).every((q) => !q.stale) && Object.keys(quotes).length > 0) {
    updatedAt = now;
  }

  return {
    quotes,
    fx,
    delayed,
    sources,
    missing: unique.filter((t) => !quotes[t]),
    updatedAt,
  };
}
