/**
 * Twelve Data fallback quote provider — free tier (800 credits/day, no
 * credit card) at https://twelvedata.com/pricing. Only used when
 * TWELVE_DATA_API_KEY is set and only for tickers the primary provider
 * (Yahoo) couldn't price, so it's a light, optional second opinion rather
 * than a hard dependency.
 */
import { synthesizeSparkline } from "@/lib/market/sparkline";
import { listingCurrency } from "@/lib/listing-currency";
import type { Quote } from "@/lib/types";
import {
  isMarketCircuitOpen,
  marketFetch,
  MarketHttpError,
  noteMarketFailure,
} from "@/lib/market/circuit-breaker";
import {
  isPlausiblePrice,
  numFromUnknown,
  twelveDataPayloadSchema,
  twelveDataQuoteSchema,
} from "@/lib/market/quote-sanitize";

export function twelveDataConfigured(): boolean {
  const key = process.env.TWELVE_DATA_API_KEY;
  return Boolean(key && key !== "your_key_here");
}

/** Best-effort — returns whatever it could price, silently drops the rest. */
export async function fetchQuotesTwelveData(
  tickers: string[]
): Promise<Record<string, Quote>> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey || tickers.length === 0) return {};
  if (isMarketCircuitOpen("twelvedata")) return {};

  const symbols = tickers.join(",");
  try {
    const res = await marketFetch(
      "twelvedata",
      `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols)}&apikey=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return {};
    const json: unknown = await res.json();
    const parsed = twelveDataPayloadSchema.safeParse(json);
    if (!parsed.success) return {};
    const data = parsed.data;

    if (
      data &&
      typeof data === "object" &&
      "status" in data &&
      data.status === "error"
    ) {
      const code = typeof data.code === "number" ? data.code : 0;
      if (code === 429 || code === 500 || code === 502 || code === 503) {
        noteMarketFailure("twelvedata");
      }
      return {};
    }

    const rawRows =
      tickers.length === 1 && "close" in data
        ? [data]
        : Object.values(data);
    const rows = rawRows.flatMap((row) => {
      const parsedRow = twelveDataQuoteSchema.safeParse(row);
      return parsedRow.success ? [parsedRow.data] : [];
    });

    const now = Date.now();
    const out: Record<string, Quote> = {};
    for (const row of rows) {
      if (!row || row.status === "error" || !row.symbol) continue;
      const price = numFromUnknown(row.close);
      if (price == null || !isPlausiblePrice(price)) continue;
      const previousClose = numFromUnknown(row.previous_close);
      const change = numFromUnknown(row.change) ?? price - (previousClose || price);
      const changePercent = (numFromUnknown(row.percent_change) ?? 0) / 100;
      const ticker = row.symbol.toUpperCase();
      out[ticker] = {
        ticker,
        price,
        change: Number.isFinite(change) ? change : 0,
        changePercent: Number.isFinite(changePercent) ? changePercent : 0,
        previousClose:
          previousClose != null && isPlausiblePrice(Math.abs(previousClose))
            ? previousClose
            : price,
        sparkline: synthesizeSparkline(
          price,
          Number.isFinite(changePercent) ? changePercent * 100 : 0
        ),
        marketState: null,
        preMarketPrice: null,
        preMarketChange: null,
        preMarketChangePercent: null,
        postMarketPrice: null,
        postMarketChange: null,
        postMarketChangePercent: null,
        currency: listingCurrency(ticker),
        nativePrice: price,
        stale: false,
        quotedAt: now,
      };
    }
    return out;
  } catch (err) {
    if (err instanceof MarketHttpError) {
      console.error("Twelve Data rate limited", err.status);
    } else {
      console.error("Twelve Data fallback failed", err);
    }
    return {};
  }
}
