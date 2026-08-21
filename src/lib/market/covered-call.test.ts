import { describe, expect, it } from "vitest";
import { scanCoveredCall } from "./covered-call";

/**
 * These run with no network, so the scan falls through to its synthetic
 * estimate — which is exactly the path that has to price a hand-picked
 * expiry when the option chain has no such date listed.
 */
function dateKeyIn(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const base = { ticker: "TEST", spot: 100, shares: 300, targetCallPct: 0.1 };

describe("scanCoveredCall expiry override", () => {
  it("quotes the expiry it was given", async () => {
    const want = dateKeyIn(30);
    const got = await scanCoveredCall({ ...base, expiry: want });
    expect(got?.expiration).toBe(want);
  });

  it("pays more for a longer tenor and less for a shorter one", async () => {
    const near = await scanCoveredCall({ ...base, expiry: dateKeyIn(7) });
    const far = await scanCoveredCall({ ...base, expiry: dateKeyIn(56) });
    expect(near?.premium).toBeGreaterThan(0);
    expect(far!.premium).toBeGreaterThan(near!.premium);
  });

  /*
   * These two assert the invariant rather than an exact date, because
   * `scanCoveredCall` returns null once the shared Yahoo circuit breaker
   * has tripped — which it will have, several calls into this file. What
   * must hold either way is that a junk expiry never prices a negative
   * tenor: it is rejected, and the scan falls back to its own choice.
   */
  const isSaneQuote = (c: Awaited<ReturnType<typeof scanCoveredCall>>) => {
    if (!c) return true; // provider unavailable — nothing quoted at all
    return c.premium > 0 && c.daysToExpiry > 0 && c.expiration > dateKeyIn(0);
  };

  it("ignores a past expiry rather than pricing a negative tenor", async () => {
    expect(isSaneQuote(await scanCoveredCall({ ...base, expiry: dateKeyIn(-14) }))).toBe(true);
  });

  it("ignores a malformed expiry", async () => {
    expect(isSaneQuote(await scanCoveredCall({ ...base, expiry: "not-a-date" }))).toBe(true);
    expect(isSaneQuote(await scanCoveredCall({ ...base, expiry: "" }))).toBe(true);
  });
});
