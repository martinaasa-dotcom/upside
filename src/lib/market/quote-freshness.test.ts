import { describe, expect, it } from "vitest";
import { quoteAsOfTitle, quotesAreDelayed, quotesStampMs } from "./quote-freshness";
import type { Quote } from "@/lib/types";

const stale: Quote = {
  ticker: "NBIS",
  price: 100,
  change: 0,
  changePercent: 0,
  previousClose: 100,
  sparkline: [],
  marketState: null,
  preMarketPrice: null,
  preMarketChange: null,
  preMarketChangePercent: null,
  postMarketPrice: null,
  postMarketChange: null,
  postMarketChangePercent: null,
  stale: true,
  quotedAt: Date.now() - 15 * 60 * 1000,
};

describe("quote freshness copy", () => {
  it("names the age of a stale print", () => {
    expect(quoteAsOfTitle(stale)).toBe("Price as of 15m ago");
    expect(quoteAsOfTitle({ ...stale, stale: false })).toBeUndefined();
  });

  it("uses the payload stamp when present", () => {
    const at = "2026-08-17T12:00:00.000Z";
    expect(quotesStampMs({ updatedAt: at })).toBe(Date.parse(at));
    expect(quotesAreDelayed({ delayed: false, quotes: { NBIS: stale } })).toBe(
      true
    );
  });
});
