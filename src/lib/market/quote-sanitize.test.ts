import { describe, expect, it } from "vitest";
import {
  isPlausiblePrice,
  MAX_SANE_PRICE,
  sanitizeQuote,
  twelveDataPayloadSchema,
  finnhubQuoteSchema,
  yahooQuotePayloadSchema,
} from "./quote-sanitize";
import type { Quote } from "@/lib/types";

function q(price: number, extra: Partial<Quote> = {}): Quote {
  return {
    ticker: "TEST",
    price,
    change: 0,
    changePercent: 0,
    previousClose: price,
    sparkline: [price],
    marketState: null,
    preMarketPrice: null,
    preMarketChange: null,
    preMarketChangePercent: null,
    postMarketPrice: null,
    postMarketChange: null,
    postMarketChangePercent: null,
    ...extra,
  };
}

describe("quote sanitization", () => {
  it("drops zero and ten-million spikes", () => {
    expect(isPlausiblePrice(0)).toBe(false);
    expect(isPlausiblePrice(MAX_SANE_PRICE + 1)).toBe(false);
    expect(sanitizeQuote(q(0))).toBeNull();
    expect(sanitizeQuote(q(10_000_000))).toBeNull();
    expect(sanitizeQuote(q(142.5))?.price).toBe(142.5);
  });

  it("drops a 100x jump versus last known", () => {
    expect(sanitizeQuote(q(15_000), q(100))).toBeNull();
    expect(sanitizeQuote(q(0.5), q(100))).toBeNull();
    expect(sanitizeQuote(q(110), q(100))?.price).toBe(110);
  });

  it("accepts a well-formed Yahoo payload and rejects junk", () => {
    expect(
      yahooQuotePayloadSchema.safeParse({
        regularMarketPrice: 12.3,
        marketState: "REGULAR",
        currency: "USD",
      }).success
    ).toBe(true);
    expect(
      yahooQuotePayloadSchema.safeParse({ regularMarketPrice: "nope" }).success
    ).toBe(false);
  });

  it("parses Twelve Data and Finnhub shapes", () => {
    expect(
      twelveDataPayloadSchema.safeParse({
        symbol: "NBIS",
        close: "48.2",
        previous_close: "47.1",
      }).success
    ).toBe(true);
    expect(finnhubQuoteSchema.safeParse({ c: 48.2, pc: 47.1, d: 1.1, dp: 2.3 }).success).toBe(
      true
    );
    expect(finnhubQuoteSchema.safeParse({ c: "bad" }).success).toBe(false);
  });
});
