/**
 * Twelve Data fallback quote provider — free tier (800 credits/day, no
 * credit card) at https://twelvedata.com/pricing. Only used when
 * TWELVE_DATA_API_KEY is set and only for tickers the primary provider
 * (Yahoo) couldn't price, so it's a light, optional second opinion rather
 * than a hard dependency.
 */
import type { Quote } from "@/lib/types";

type TwelveDataQuote = {
  symbol?: string;
  close?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  status?: string;
  code?: number;
};

function synthesizeSparkline(price: number, changePercent: number): number[] {
  const points = 30;
  const start = price / (1 + changePercent / 100);
  const series: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const drift = start + (price - start) * t;
    const noise = Math.sin(i * 1.7) * price * 0.008;
    series.push(Math.max(0.01, drift + noise));
  }
  series[series.length - 1] = price;
  return series;
}

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

  // Batch endpoint accepts comma-joined symbols and returns either a single
  // object (1 symbol) or a map of symbol -> quote (multiple symbols).
  const symbols = tickers.join(",");
  try {
    const res = await fetch(
      `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols)}&apikey=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return {};
    const data = (await res.json()) as
      | TwelveDataQuote
      | Record<string, TwelveDataQuote>;

    const rows: TwelveDataQuote[] =
      tickers.length === 1
        ? [data as TwelveDataQuote]
        : Object.values(data as Record<string, TwelveDataQuote>);

    const out: Record<string, Quote> = {};
    for (const row of rows) {
      if (!row || row.status === "error" || !row.symbol) continue;
      const price = Number(row.close);
      if (!Number.isFinite(price) || price <= 0) continue;
      const previousClose = Number(row.previous_close);
      const change = Number(row.change ?? price - (previousClose || price));
      const changePercent = Number(row.percent_change ?? 0) / 100;
      const ticker = row.symbol.toUpperCase();
      out[ticker] = {
        ticker,
        price,
        change: Number.isFinite(change) ? change : 0,
        changePercent: Number.isFinite(changePercent) ? changePercent : 0,
        previousClose: Number.isFinite(previousClose) ? previousClose : price,
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
      };
    }
    return out;
  } catch (err) {
    console.error("Twelve Data fallback failed", err);
    return {};
  }
}
