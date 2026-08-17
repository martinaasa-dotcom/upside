/**
 * Validate third-party quote payloads before they enter book math.
 * Drop 0.00, non-finite junk, and $10,000,000-class spikes.
 */
import { z } from "zod";
import type { Quote } from "@/lib/types";

export const MIN_SANE_PRICE = 0.0001;
export const MAX_SANE_PRICE = 10_000_000;
/** Versus last known. Wide enough for a real crash or split, tight on feed bugs. */
export const SPIKE_RATIO = 100;

const finite = z.number().finite();
const numish = z.union([finite, z.string()]);

export const yahooQuotePayloadSchema = z.looseObject({
  regularMarketPrice: finite.nullish(),
  regularMarketPreviousClose: finite.nullish(),
  regularMarketChange: finite.nullish(),
  regularMarketOpen: finite.nullish(),
  preMarketPrice: finite.nullish(),
  preMarketChange: finite.nullish(),
  preMarketChangePercent: finite.nullish(),
  postMarketPrice: finite.nullish(),
  postMarketChange: finite.nullish(),
  postMarketChangePercent: finite.nullish(),
  marketState: z.string().nullish(),
  currency: z.string().nullish(),
});

export const twelveDataQuoteSchema = z.looseObject({
  symbol: z.string().optional(),
  close: numish.optional(),
  previous_close: numish.optional(),
  change: numish.optional(),
  percent_change: numish.optional(),
  status: z.string().optional(),
  code: finite.optional(),
  message: z.string().optional(),
});

export const twelveDataPayloadSchema = z.union([
  twelveDataQuoteSchema,
  z.record(z.string(), twelveDataQuoteSchema),
]);

export const finnhubQuoteSchema = z.looseObject({
  c: finite.optional(),
  d: finite.optional(),
  dp: finite.optional(),
  pc: finite.optional(),
});

export const cnnFearGreedSchema = z.looseObject({
  fear_and_greed: z
    .looseObject({
      score: finite.optional(),
      rating: z.string().optional(),
      timestamp: z.string().optional(),
    })
    .optional(),
});

export function numFromUnknown(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function isPlausiblePrice(
  price: number,
  previous?: number | null
): boolean {
  if (!Number.isFinite(price)) return false;
  if (price < MIN_SANE_PRICE || price >= MAX_SANE_PRICE) return false;
  if (previous != null && previous > 0 && Number.isFinite(previous)) {
    const ratio = price / previous;
    if (ratio > SPIKE_RATIO || ratio < 1 / SPIKE_RATIO) return false;
  }
  return true;
}

export function sanitizeQuote(
  quote: Quote,
  lastKnown?: Quote | null
): Quote | null {
  const baseline =
    lastKnown && lastKnown.price > 0 ? lastKnown.price : quote.previousClose;
  if (!isPlausiblePrice(quote.price, baseline)) return null;
  if (
    quote.previousClose != null &&
    quote.previousClose !== 0 &&
    !isPlausiblePrice(Math.abs(quote.previousClose))
  ) {
    return null;
  }
  if (
    quote.nativePrice != null &&
    quote.nativePrice > 0 &&
    !isPlausiblePrice(quote.nativePrice)
  ) {
    return null;
  }
  const sparkline = Array.isArray(quote.sparkline)
    ? quote.sparkline.filter((n) => typeof n === "number" && Number.isFinite(n))
    : [];
  return { ...quote, sparkline };
}
