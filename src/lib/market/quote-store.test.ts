import { afterEach, describe, expect, it } from "vitest";
import {
  recallQuotesFromMemory,
  rememberQuotesInMemory,
  resetQuoteStoreForTests,
} from "./quote-store";
import type { Quote } from "@/lib/types";

function q(ticker: string, price: number): Quote {
  return {
    ticker,
    price,
    change: 0,
    changePercent: 0,
    previousClose: price,
    sparkline: [],
    marketState: null,
    preMarketPrice: null,
    preMarketChange: null,
    preMarketChangePercent: null,
    postMarketPrice: null,
    postMarketChange: null,
    postMarketChangePercent: null,
    stale: false,
    quotedAt: Date.now(),
  };
}

afterEach(() => {
  resetQuoteStoreForTests();
});

describe("quote store memory", () => {
  it("recalls last known prints as stale", () => {
    rememberQuotesInMemory({ NBIS: q("NBIS", 48.2) });
    const hit = recallQuotesFromMemory(["NBIS"]);
    expect(hit.NBIS?.price).toBe(48.2);
    expect(hit.NBIS?.stale).toBe(true);
  });

  it("does not cache a print that is already stale", () => {
    rememberQuotesInMemory({
      NBIS: { ...q("NBIS", 48.2), stale: true },
    });
    expect(recallQuotesFromMemory(["NBIS"])).toEqual({});
  });
});
