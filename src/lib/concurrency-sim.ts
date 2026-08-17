/**
 * In-process stand-in for the production write path:
 *   1. compare-and-swap the holding row
 *   2. then add the cash delta under the same row lock Postgres takes on
 *      portfell_apply_cash_delta
 *
 * Lock order is holding then cash, matching /api/holdings. Reversing it
 * deadlocks; this sim fails the run if that happens.
 */

export const MUTATION_LOCK_ORDER = ["holding", "cash"] as const;
export type MutationLock = (typeof MUTATION_LOCK_ORDER)[number];

export const DEFAULT_BENCH_WORKERS = 64;

class Mutex {
  private chain: Promise<void> = Promise.resolve();

  acquire(): Promise<() => void> {
    let release!: () => void;
    const done = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.chain;
    this.chain = prev.then(() => done);
    return prev.then(() => release);
  }
}

class DeadlockError extends Error {
  constructor() {
    super("deadlock");
    this.name = "DeadlockError";
  }
}

async function acquireWithTimeout(
  mutex: Mutex,
  timeoutMs: number
): Promise<() => void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      mutex.acquire(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DeadlockError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type CashLedger = { balance: number };

/** Racy read-modify-write. Two overlapping callers lose one delta. */
export async function applyCashDeltaRacy(
  ledger: CashLedger,
  delta: number
): Promise<number> {
  const current = ledger.balance;
  await Promise.resolve();
  ledger.balance = Math.round((current + delta) * 100) / 100;
  return ledger.balance;
}

/** Atomic add, the same shape as portfell_apply_cash_delta. */
export async function applyCashDeltaAtomic(
  ledger: CashLedger,
  delta: number,
  lock: Mutex
): Promise<number> {
  const release = await lock.acquire();
  try {
    ledger.balance =
      Math.round((ledger.balance + Math.round(delta * 100) / 100) * 100) / 100;
    return ledger.balance;
  } finally {
    release();
  }
}

export type HoldingRow = { shares: number };

/** Compare-and-swap on shares. Returns false when another writer won. */
export function casHoldingShares(
  row: HoldingRow,
  expected: number,
  next: number
): boolean {
  if (row.shares !== expected) return false;
  row.shares = next;
  return true;
}

export async function casHoldingSharesWithRetry(
  row: HoldingRow,
  add: number,
  attempts: number
): Promise<{ ok: boolean; retries: number }> {
  let retries = 0;
  for (let i = 0; i < attempts; i++) {
    const expected = row.shares;
    await Promise.resolve();
    if (casHoldingShares(row, expected, expected + add)) {
      return { ok: true, retries };
    }
    retries += 1;
  }
  return { ok: false, retries };
}

export type ConcurrencyBenchReport = {
  workers: number;
  cashFinal: number;
  cashExpected: number;
  racyCashFinal: number;
  racyLostUpdates: number;
  casSuccess: number;
  casRetries: number;
  casExhausted: number;
  casFinalShares: number;
  casExpectedShares: number;
  deadlocks: number;
  dirtyReads: number;
  ok: boolean;
};

export async function runConcurrencyBench(opts?: {
  workers?: number;
  startCash?: number;
  startShares?: number;
  delta?: number;
  shareStep?: number;
  casAttempts?: number;
}): Promise<ConcurrencyBenchReport> {
  const workers = opts?.workers ?? DEFAULT_BENCH_WORKERS;
  const startCash = opts?.startCash ?? 10_000;
  const startShares = opts?.startShares ?? 100;
  const delta = opts?.delta ?? 1;
  const shareStep = opts?.shareStep ?? 1;
  const casAttempts = opts?.casAttempts ?? 32;

  const racy: CashLedger = { balance: startCash };
  await Promise.all(
    Array.from({ length: workers }, () => applyCashDeltaRacy(racy, delta))
  );
  const racyLostUpdates = workers - Math.round((racy.balance - startCash) / delta);

  const atomic: CashLedger = { balance: startCash };
  const cashLock = new Mutex();
  const deltaCents = Math.round(delta * 100);
  const startCents = Math.round(startCash * 100);
  let dirtyReads = 0;
  const noteIfTorn = (balance: number) => {
    const cents = Math.round(balance * 100) - startCents;
    if (cents % deltaCents !== 0) dirtyReads += 1;
  };
  const writers = Promise.all(
    Array.from({ length: workers }, async () => {
      const next = await applyCashDeltaAtomic(atomic, delta, cashLock);
      noteIfTorn(next);
    })
  );
  const reader = (async () => {
    for (let i = 0; i < workers * 4; i++) {
      noteIfTorn(atomic.balance);
      await Promise.resolve();
    }
  })();
  await Promise.all([writers, reader]);

  const holding: HoldingRow = { shares: startShares };
  let casSuccess = 0;
  let casRetries = 0;
  let casExhausted = 0;
  const casTries = Math.max(casAttempts, workers + 8);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      const result = await casHoldingSharesWithRetry(
        holding,
        shareStep,
        casTries
      );
      casRetries += result.retries;
      if (result.ok) casSuccess += 1;
      else casExhausted += 1;
    })
  );

  let deadlocks = 0;
  const orderedHolding = new Mutex();
  const orderedCash = new Mutex();
  const locks: Record<MutationLock, Mutex> = {
    holding: orderedHolding,
    cash: orderedCash,
  };
  await Promise.all(
    Array.from({ length: workers }, async () => {
      const releases: Array<() => void> = [];
      try {
        for (const name of MUTATION_LOCK_ORDER) {
          releases.push(await acquireWithTimeout(locks[name], 2_000));
        }
      } catch (err) {
        if (err instanceof DeadlockError) deadlocks += 1;
        else throw err;
      } finally {
        for (const release of releases.reverse()) release();
      }
    })
  );

  const cashExpected = startCash + workers * delta;
  const casExpectedShares = startShares + casSuccess * shareStep;
  const ok =
    atomic.balance === cashExpected &&
    racyLostUpdates > 0 &&
    casSuccess === workers &&
    casExhausted === 0 &&
    holding.shares === casExpectedShares &&
    deadlocks === 0 &&
    dirtyReads === 0;

  return {
    workers,
    cashFinal: atomic.balance,
    cashExpected,
    racyCashFinal: racy.balance,
    racyLostUpdates,
    casSuccess,
    casRetries,
    casExhausted,
    casFinalShares: holding.shares,
    casExpectedShares,
    deadlocks,
    dirtyReads,
    ok,
  };
}

/** Opposite lock order must time out. Proves the detector is not a no-op. */
export async function reverseLockOrderDeadlocks(): Promise<boolean> {
  const holding = new Mutex();
  const cash = new Mutex();
  let releaseGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  let arrived = 0;
  const afterFirstLock = () => {
    arrived += 1;
    if (arrived === 2) releaseGate();
  };
  const a = (async () => {
    const r1 = await holding.acquire();
    afterFirstLock();
    await gate;
    try {
      const r2 = await acquireWithTimeout(cash, 400);
      r2();
    } finally {
      r1();
    }
  })();
  const b = (async () => {
    const r1 = await cash.acquire();
    afterFirstLock();
    await gate;
    try {
      const r2 = await acquireWithTimeout(holding, 400);
      r2();
    } finally {
      r1();
    }
  })();
  const results = await Promise.allSettled([a, b]);
  return results.some(
    (r) => r.status === "rejected" && r.reason instanceof DeadlockError
  );
}
