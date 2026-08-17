/**
 * Local high-concurrency pass for cash RPC + holding compare-and-swap.
 *
 * Always runs the in-process sim (64 overlapping writers). When Supabase
 * env is present, also creates a throwaway sheet, fires the same load at
 * portfell_apply_cash_delta and a shares CAS, then deletes the sheet.
 *
 *   npx tsx scripts/bench-concurrency.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_BENCH_WORKERS,
  reverseLockOrderDeadlocks,
  runConcurrencyBench,
} from "../src/lib/concurrency-sim";
import { supabaseFetch } from "../src/lib/supabase/http";
import { PORTFELL_TABLES } from "../src/lib/supabase/tables";

const BENCH_NAME = "__bench_concurrency__";
const LIVE_WORKERS = DEFAULT_BENCH_WORKERS;
const START_CASH = 10_000;
const START_SHARES = 100;
const DELTA = 1;
const TICKER = "BENCH";

function loadDotEnv(path: string) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
    if (process.env[key]) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function liveClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: supabaseFetch },
  });
}

async function runLive(): Promise<void> {
  const supabase = liveClient();
  if (!supabase) {
    console.log("live: skipped (no SUPABASE_SERVICE_ROLE_KEY)");
    return;
  }

  await supabase.from(PORTFELL_TABLES.portfolios).delete().eq("name", BENCH_NAME);

  const slug = `bench-load-${Date.now()}`;
  const { data: created, error: createErr } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .insert({
      name: BENCH_NAME,
      slug,
      sort_order: 9999,
      cash_balance: START_CASH,
    })
    .select("id")
    .single();
  if (createErr || !created?.id) {
    throw new Error(`live create failed: ${createErr?.message ?? "no id"}`);
  }
  const portfolioId = created.id as string;

  try {
    const { data: holding, error: holdErr } = await supabase
      .from(PORTFELL_TABLES.holdings)
      .insert({
        portfolio_id: portfolioId,
        ticker: TICKER,
        shares: START_SHARES,
        buy_price: 10,
        sort_order: 1,
      })
      .select("id")
      .single();
    if (holdErr || !holding?.id) {
      throw new Error(`live holding failed: ${holdErr?.message ?? "no id"}`);
    }
    const holdingId = holding.id as string;

    const cashResults = await Promise.all(
      Array.from({ length: LIVE_WORKERS }, async () => {
        const { data, error } = await supabase.rpc("portfell_apply_cash_delta", {
          p_portfolio_id: portfolioId,
          p_delta: DELTA,
        });
        if (error) throw new Error(error.message);
        return Number(data);
      })
    );

    const { data: cashRow, error: cashReadErr } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .select("cash_balance")
      .eq("id", portfolioId)
      .single();
    if (cashReadErr) throw new Error(cashReadErr.message);
    const cashFinal = Number(cashRow?.cash_balance);
    const cashExpected = START_CASH + LIVE_WORKERS * DELTA;
    const uniqueReturned = new Set(cashResults.map((n) => Math.round(n * 100)));
    if (uniqueReturned.size !== LIVE_WORKERS) {
      throw new Error(
        `dirty cash reads: ${uniqueReturned.size} distinct RPC results, want ${LIVE_WORKERS}`
      );
    }
    if (cashFinal !== cashExpected) {
      throw new Error(`cash ${cashFinal} !== expected ${cashExpected}`);
    }

    const cas = await Promise.all(
      Array.from({ length: LIVE_WORKERS }, async () => {
        for (let attempt = 0; attempt < 48; attempt++) {
          const { data: row, error: readErr } = await supabase
            .from(PORTFELL_TABLES.holdings)
            .select("shares")
            .eq("id", holdingId)
            .single();
          if (readErr) throw new Error(readErr.message);
          const expected = Number(row?.shares);
          const { data, error } = await supabase
            .from(PORTFELL_TABLES.holdings)
            .update({
              shares: expected + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", holdingId)
            .eq("shares", expected)
            .select("shares")
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (data) return { ok: true as const, retries: attempt };
        }
        return { ok: false as const, retries: 48 };
      })
    );

    const casSuccess = cas.filter((c) => c.ok).length;
    const { data: shareRow, error: shareErr } = await supabase
      .from(PORTFELL_TABLES.holdings)
      .select("shares")
      .eq("id", holdingId)
      .single();
    if (shareErr) throw new Error(shareErr.message);
    const sharesFinal = Number(shareRow?.shares);
    const sharesExpected = START_SHARES + casSuccess;
    if (casSuccess !== LIVE_WORKERS) {
      throw new Error(`CAS success ${casSuccess} / ${LIVE_WORKERS}`);
    }
    if (sharesFinal !== sharesExpected) {
      throw new Error(`shares ${sharesFinal} !== expected ${sharesExpected}`);
    }

    console.log(
      `live: ${LIVE_WORKERS} cash RPCs → ${cashFinal} (exact), ${casSuccess} CAS updates → ${sharesFinal} shares, 0 dirty reads`
    );
  } finally {
    const { error: dropErr } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .delete()
      .eq("id", portfolioId);
    if (dropErr) {
      console.error(`live cleanup failed for ${portfolioId}: ${dropErr.message}`);
    }
  }
}

async function main() {
  loadDotEnv(".env.local");
  loadDotEnv(".env");

  const sim = await runConcurrencyBench({ workers: DEFAULT_BENCH_WORKERS });
  console.log(
    `sim: ${sim.workers} workers, cash ${sim.cashFinal}/${sim.cashExpected}, racy lost ${sim.racyLostUpdates}, CAS ${sim.casSuccess} ok / ${sim.casRetries} retries / ${sim.casExhausted} exhausted, deadlocks ${sim.deadlocks}, dirty ${sim.dirtyReads}`
  );
  if (!sim.ok) {
    throw new Error("in-process concurrency bench failed");
  }
  if (!(await reverseLockOrderDeadlocks())) {
    throw new Error("reverse lock-order detector did not fire");
  }

  await runLive();
  console.log("concurrency bench passed");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
