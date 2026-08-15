/**
 * Finnhub fallback quote provider — free tier (60 calls/min, no credit
 * card) at https://finnhub.io/register. Only used when FINNHUB_API_KEY is
 * set and only for tickers no earlier provider in the chain could price.
 */
import { synthesizeSparkline } from "@/lib/market/sparkline";
import type { Quote } from "@/lib/types";

type FinnhubQuote = {
  c?: number; // current price
  d?: number; // change
  dp?: number; // percent change
  pc?: number; // previous close
};

export function finnhubConfigured(): boolean {
  const key = process.env.FINNHUB_API_KEY;
  return Boolean(key && key !== "your_key_here");
}

/** Best-effort, one request per ticker (Finnhub has no batch quote endpoint). */
export async function fetchQuotesFinnhub(
  tickers: string[]
): Promise<Record<string, Quote>> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey || tickers.length === 0) return {};

  const out: Record<string, Quote> = {};
  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(apiKey)}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) return;
        const row = (await res.json()) as FinnhubQuote;
        const price = row.c;
        if (!Number.isFinite(price) || !(price! > 0)) return;
        const previousClose = row.pc ?? price!;
        const change = row.d ?? price! - previousClose;
        const changePercent = (row.dp ?? 0) / 100;
        out[ticker.toUpperCase()] = {
          ticker: ticker.toUpperCase(),
          price: price!,
          change,
          changePercent,
          previousClose,
          sparkline: synthesizeSparkline(price!, changePercent * 100),
          marketState: null,
          preMarketPrice: null,
          preMarketChange: null,
          preMarketChangePercent: null,
          postMarketPrice: null,
          postMarketChange: null,
          postMarketChangePercent: null,
        };
      } catch (err) {
        console.error(`Finnhub fallback failed for ${ticker}`, err);
      }
    })
  );
  return out;
}
