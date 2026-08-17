import { describe, expect, it } from "vitest";
import {
  DEFAULT_BENCH_WORKERS,
  reverseLockOrderDeadlocks,
  runConcurrencyBench,
} from "@/lib/concurrency-sim";
import {
  isDirectPostgresUrl,
  isSupabasePoolerUrl,
} from "@/lib/supabase/env";

describe("concurrent cash and holding CAS", () => {
  it("keeps every cash delta and every share increment under 64 overlapping writers", async () => {
    const report = await runConcurrencyBench({ workers: DEFAULT_BENCH_WORKERS });
    expect(report.racyLostUpdates).toBeGreaterThan(0);
    expect(report.cashFinal).toBe(report.cashExpected);
    expect(report.casSuccess).toBe(DEFAULT_BENCH_WORKERS);
    expect(report.casExhausted).toBe(0);
    expect(report.casFinalShares).toBe(report.casExpectedShares);
    expect(report.deadlocks).toBe(0);
    expect(report.dirtyReads).toBe(0);
    expect(report.ok).toBe(true);
  });

  it("deadlocks when the holding/cash lock order is reversed", async () => {
    expect(await reverseLockOrderDeadlocks()).toBe(true);
  });
});

describe("supabase pooler URLs", () => {
  it("treats port 5432 as direct and 6543 as transaction-mode pooler", () => {
    expect(
      isDirectPostgresUrl(
        "postgresql://postgres:x@db.uzrnybyggznpvgxgrvgl.supabase.co:5432/postgres"
      )
    ).toBe(true);
    expect(
      isSupabasePoolerUrl(
        "postgresql://postgres.foo:x@aws-0-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
      )
    ).toBe(true);
    expect(
      isDirectPostgresUrl(
        "postgresql://postgres.foo:x@aws-0-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
      )
    ).toBe(false);
  });
});
