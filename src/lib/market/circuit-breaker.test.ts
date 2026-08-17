import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CircuitOpenError,
  isMarketCircuitOpen,
  isTransientMarketError,
  marketCircuitSnapshot,
  MarketHttpError,
  resetMarketCircuits,
  withMarketCircuit,
} from "./circuit-breaker";

afterEach(() => {
  resetMarketCircuits();
  vi.useRealTimers();
});

describe("market circuit breaker", () => {
  it("treats 429 and 503 as transient", () => {
    expect(isTransientMarketError(new MarketHttpError("yahoo", 429, 1000))).toBe(
      true
    );
    expect(isTransientMarketError(new Error("Too Many Requests"))).toBe(true);
    expect(isTransientMarketError(new Error("not found"), 404)).toBe(false);
  });

  it("opens after repeated failures and fails over instantly", async () => {
    const fn = vi.fn(async () => {
      throw new MarketHttpError("yahoo", 429, null);
    });
    for (let i = 0; i < 3; i++) {
      await expect(
        withMarketCircuit("yahoo", fn, { retries: 0 })
      ).rejects.toBeInstanceOf(MarketHttpError);
    }
    expect(isMarketCircuitOpen("yahoo")).toBe(true);
    expect(marketCircuitSnapshot("yahoo")).toBe("open");

    const probe = vi.fn(async () => 1);
    const t0 = Date.now();
    await expect(withMarketCircuit("yahoo", probe)).rejects.toBeInstanceOf(
      CircuitOpenError
    );
    expect(Date.now() - t0).toBeLessThan(40);
    expect(probe).not.toHaveBeenCalled();
  });

  it("retries transient errors with exponential backoff then succeeds", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new MarketHttpError("finnhub", 503, null);
      return "ok";
    });
    const pending = withMarketCircuit("finnhub", fn);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
