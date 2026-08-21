/**
 * The circuit breaker must not degrade worse than the failure it protects
 * against. When Yahoo throws, the scan already answers with a synthetic
 * estimate; when the breaker is open -- which only happens *because* Yahoo
 * has been throwing -- it used to answer with nothing at all, so the reader
 * saw an empty Premium column precisely when the provider was worst.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { scanCoveredCall } from "@/lib/market/covered-call";
import {
  noteMarketFailure,
  isMarketCircuitOpen,
  resetMarketCircuits,
} from "@/lib/market/circuit-breaker";

beforeEach(() => {
  resetMarketCircuits();
});

describe("covered-call scan while Yahoo's breaker is open", () => {
  it("still prices the position instead of returning nothing", async () => {
    // Three failures is the threshold.
    noteMarketFailure("yahoo");
    noteMarketFailure("yahoo");
    noteMarketFailure("yahoo");
    expect(isMarketCircuitOpen("yahoo")).toBe(true);

    const candidate = await scanCoveredCall({
      ticker: "NVDA",
      spot: 100,
      shares: 300,
      targetCallPct: 0.15,
    });

    expect(candidate).not.toBeNull();
    expect(candidate!.contracts).toBe(3);
    expect(candidate!.strike).toBeGreaterThan(100);
    expect(candidate!.premium).toBeGreaterThan(0);
    expect(Number.isFinite(candidate!.premium)).toBe(true);
  });

  it("still refuses when the position genuinely cannot carry a call", async () => {
    noteMarketFailure("yahoo");
    noteMarketFailure("yahoo");
    noteMarketFailure("yahoo");

    // Under one contract's worth of shares: nothing to sell, breaker or not.
    const candidate = await scanCoveredCall({
      ticker: "NVDA",
      spot: 100,
      shares: 40,
    });
    expect(candidate).toBeNull();
  });
});
