/**
 * Daily Duel — pick which holding finishes the US cash session higher.
 * One deterministic matchup per Tallinn day. Pick anytime; results only
 * after the US regular close (4pm America/New_York) so live quotes can’t
 * spoil the game. Local to this browser.
 */
import { todayKeyInTz } from "@/lib/timezone";

const KEY = "upside-daily-duel-v2";
const MAX_HISTORY = 60;
const US_TZ = "America/New_York";

export type DuelPick = "a" | "b";
export type DuelOutcome = "pending" | "win" | "loss" | "push";

export type DuelRecord = {
  dayKey: string;
  tickerA: string;
  tickerB: string;
  pick: DuelPick | null;
  revealedPctA: number | null;
  revealedPctB: number | null;
  outcome: DuelOutcome;
};

export type DuelStats = {
  currentStreak: number;
  bestStreak: number;
  totalPlayed: number;
  totalCorrect: number;
  accuracyPct: number | null;
};

type DuelStorage = { history: DuelRecord[] };

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadStorage(): DuelStorage {
  if (typeof window === "undefined") return { history: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { history: [] };
    const parsed = JSON.parse(raw) as DuelStorage;
    return { history: Array.isArray(parsed.history) ? parsed.history : [] };
  } catch {
    return { history: [] };
  }
}

function saveStorage(s: DuelStorage) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ history: s.history.slice(-MAX_HISTORY) })
    );
  } catch {
    /* ignore */
  }
}

/**
 * True once the US regular equity session is done for “today” in New York
 * (weekday after 16:00 ET, or any weekend — use last available session %).
 */
export function duelCanSettle(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: US_TZ,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  if (weekday === "Sat" || weekday === "Sun") return true;
  return hour >= 16;
}

/** Deterministic pair for the day — same matchup all day, changes tomorrow. */
export function pickTodaysDuel(
  tickers: string[],
  dayKey: string = todayKeyInTz()
): { a: string; b: string } | null {
  const pool = [...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))];
  if (pool.length < 2) return null;
  const rng = mulberry32(hashSeed(`upside-duel|${dayKey}`));
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return { a: shuffled[0]!, b: shuffled[1]! };
}

/** Load (or create) today's matchup. Returns null if the book has <2 tickers. */
export function getOrCreateTodaysDuel(
  tickers: string[],
  dayKey: string = todayKeyInTz()
): DuelRecord | null {
  const storage = loadStorage();
  const existing = storage.history.find((r) => r.dayKey === dayKey);
  if (existing) return existing;

  const pair = pickTodaysDuel(tickers, dayKey);
  if (!pair) return null;

  const record: DuelRecord = {
    dayKey,
    tickerA: pair.a,
    tickerB: pair.b,
    pick: null,
    revealedPctA: null,
    revealedPctB: null,
    outcome: "pending",
  };
  saveStorage({ history: [...storage.history, record] });
  return record;
}

/**
 * Lock in a pick. Does not reveal session % until after the US close —
 * otherwise live quotes spoil the prediction.
 */
export function makeDuelPick(
  dayKey: string,
  pick: DuelPick,
  todayPctByTicker: Record<string, number | null | undefined>
): DuelRecord | null {
  const storage = loadStorage();
  const idx = storage.history.findIndex((r) => r.dayKey === dayKey);
  if (idx < 0) return null;
  const rec = storage.history[idx]!;
  if (rec.pick != null) return rec; // no take-backs

  const locked: DuelRecord = {
    ...rec,
    pick,
    revealedPctA: null,
    revealedPctB: null,
    outcome: "pending",
  };
  const updated = duelCanSettle()
    ? resolveOutcome(locked, todayPctByTicker)
    : locked;
  const nextHistory = [...storage.history];
  nextHistory[idx] = updated;
  saveStorage({ history: nextHistory });
  return updated;
}

/** Settle a locked pick once the US cash session is done and quotes exist. */
export function resolvePendingOutcome(
  dayKey: string,
  todayPctByTicker: Record<string, number | null | undefined>
): DuelRecord | null {
  const storage = loadStorage();
  const idx = storage.history.findIndex((r) => r.dayKey === dayKey);
  if (idx < 0) return null;
  const rec = storage.history[idx]!;
  if (rec.pick == null || rec.outcome !== "pending") return rec;
  if (!duelCanSettle()) return rec;

  const updated = resolveOutcome(rec, todayPctByTicker);
  if (updated.outcome === "pending") return rec;
  const nextHistory = [...storage.history];
  nextHistory[idx] = updated;
  saveStorage({ history: nextHistory });
  return updated;
}

function resolveOutcome(
  rec: DuelRecord,
  todayPctByTicker: Record<string, number | null | undefined>
): DuelRecord {
  if (rec.pick == null || !duelCanSettle()) {
    return {
      ...rec,
      revealedPctA: null,
      revealedPctB: null,
      outcome: "pending",
    };
  }
  const pctA = todayPctByTicker[rec.tickerA] ?? null;
  const pctB = todayPctByTicker[rec.tickerB] ?? null;
  if (pctA == null || pctB == null) {
    return {
      ...rec,
      revealedPctA: null,
      revealedPctB: null,
      outcome: "pending",
    };
  }
  let outcome: DuelOutcome;
  if (pctA === pctB) outcome = "push";
  else {
    const winner: DuelPick = pctA > pctB ? "a" : "b";
    outcome = rec.pick === winner ? "win" : "loss";
  }
  return { ...rec, revealedPctA: pctA, revealedPctB: pctB, outcome };
}

export function loadDuelHistory(): DuelRecord[] {
  return loadStorage().history;
}

/** Everything derives from history — no separately-mutated counters to drift. */
export function duelStats(history: DuelRecord[]): DuelStats {
  const decided = history.filter(
    (r) => r.outcome === "win" || r.outcome === "loss"
  );
  const totalPlayed = decided.length;
  const totalCorrect = decided.filter((r) => r.outcome === "win").length;

  let currentStreak = 0;
  for (let i = decided.length - 1; i >= 0; i--) {
    if (decided[i]!.outcome === "win") currentStreak++;
    else break;
  }

  let bestStreak = 0;
  let run = 0;
  for (const r of decided) {
    if (r.outcome === "win") {
      run++;
      bestStreak = Math.max(bestStreak, run);
    } else {
      run = 0;
    }
  }

  return {
    currentStreak,
    bestStreak,
    totalPlayed,
    totalCorrect,
    accuracyPct: totalPlayed > 0 ? totalCorrect / totalPlayed : null,
  };
}

const WIN_LINES = [
  (t: string) => `Called it. ${t} takes the belt.`,
  (t: string) => `Certified prophet, ${t} wins.`,
  (t: string) => `${t} delivered. Your gut was right.`,
  (t: string) => `Nailed it. ${t} came out on top.`,
];
const LOSS_LINES = [
  (t: string) => `Nope, ${t} had main character energy instead.`,
  (t: string) => `The market disagreed. ${t} won this one.`,
  (t: string) => `Rough beat. ${t} took it.`,
  (t: string) => `${t} said "not today". Try again tomorrow.`,
];
const PUSH_LINE = "Dead heat, exact tie. Nobody wins, nobody cries.";

function pick<T>(seed: string, items: T[]): T {
  const rng = mulberry32(hashSeed(seed));
  return items[Math.floor(rng() * items.length) % items.length]!;
}

export function duelResultLine(rec: DuelRecord): string | null {
  if (rec.outcome === "pending") return null;
  if (rec.outcome === "push") return PUSH_LINE;
  const winnerTicker =
    (rec.revealedPctA ?? 0) >= (rec.revealedPctB ?? 0)
      ? rec.tickerA
      : rec.tickerB;
  const lines = rec.outcome === "win" ? WIN_LINES : LOSS_LINES;
  return pick(`${rec.dayKey}|${rec.outcome}`, lines)(winnerTicker);
}
