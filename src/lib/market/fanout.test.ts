/**
 * A name Yahoo does not know is the most expensive request the market layer
 * can make, not the cheapest: the exchange-suffix walk costs a `quote()` and
 * a `chart()` per candidate. These tests count the upstream calls a single
 * request actually causes, so "capped" and "remembered" are measured rather
 * than asserted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let quoteCalls = 0;
let chartCalls = 0;

vi.mock("yahoo-finance2", () => ({
  default: class {
    async quote() {
      quoteCalls++;
      return null;
    }
    async chart() {
      chartCalls++;
      return null;
    }
    async search() {
      return { quotes: [] };
    }
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: () => null,
  supabaseUsesServiceRole: () => false,
}));

const { fetchQuotesWithFallback, MAX_TICKERS_PER_REQUEST } = await import(
  "@/lib/market/quotes"
);
const { resetUnresolvableForTests } = await import(
  "@/lib/market/unresolvable"
);

beforeEach(() => {
  quoteCalls = 0;
  chartCalls = 0;
  resetUnresolvableForTests();
});

describe("upstream fan-out from one request", () => {
  it("costs a lot the first time an unknown name is asked about", async () => {
    await fetchQuotesWithFallback(["ZZQQXX"]);
    // This is the finding, not a regression: one bogus ticker walks the
    // whole suffix list. The number is here so a future change that makes
    // it worse is visible.
    expect(quoteCalls + chartCalls).toBeGreaterThan(20);
  });

  it("costs nothing the second time", async () => {
    await fetchQuotesWithFallback(["ZZQQXX"]);
    const first = quoteCalls + chartCalls;
    quoteCalls = 0;
    chartCalls = 0;
    await fetchQuotesWithFallback(["ZZQQXX"]);
    expect(first).toBeGreaterThan(20);
    expect(quoteCalls + chartCalls).toBe(0);
  });

  it("still reports the name as missing rather than pretending it resolved", async () => {
    await fetchQuotesWithFallback(["ZZQQXX"]);
    const again = await fetchQuotesWithFallback(["ZZQQXX"]);
    // The cheap path must not change what the caller is told.
    expect(again.missing).toContain("ZZQQXX");
    expect(again.quotes.ZZQQXX).toBeUndefined();
  });

  it("forgets the miss once the window passes, so a real listing recovers", async () => {
    const { markUnresolvable, isRecentlyUnresolvable } = await import(
      "@/lib/market/unresolvable"
    );
    const now = Date.now();
    markUnresolvable(["LHV1T"], now);
    expect(isRecentlyUnresolvable("LHV1T", now + 60_000)).toBe(true);
    expect(isRecentlyUnresolvable("LHV1T", now + 11 * 60_000)).toBe(false);
  });

  it("caps how many names one request may ask about", () => {
    // The ceiling exists and is generous enough for a real book.
    expect(MAX_TICKERS_PER_REQUEST).toBeGreaterThanOrEqual(100);
    expect(MAX_TICKERS_PER_REQUEST).toBeLessThanOrEqual(200);
  });
});

describe("total outage: every provider down, nothing cached", () => {
  it("reports the names as missing rather than inventing a price", async () => {
    const result = await fetchQuotesWithFallback(["NVDA", "MSFT"]);
    expect(result.missing.sort()).toEqual(["MSFT", "NVDA"]);
    expect(Object.keys(result.quotes)).toHaveLength(0);
    // The flag the UI's stale banner reads.
    expect(result.delayed).toBe(true);
  });

  it("returns an FX shape the caller can use instead of throwing", async () => {
    const result = await fetchQuotesWithFallback(["NVDA"]);
    expect(result.fx).toBeDefined();
    expect(result.updatedAt).toBeTypeOf("number");
  });
});
