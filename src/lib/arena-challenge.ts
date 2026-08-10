import type { ArenaState } from "@/lib/paper-arena";
import { defaultArena, saveArena } from "@/lib/paper-arena";
import { todayKeyInTz } from "@/lib/timezone";

const CHALLENGE_KEY = "upside-arena-challenge-v1";

export type ArenaChallenge = {
  dayKey: string;
  /** Allowed tickers (live book) */
  tickers: string[];
  startingCash: number;
  startNav: number;
  liveDayPctAtStart: number | null;
  note: string;
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function loadArenaChallenge(): ArenaChallenge | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CHALLENGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ArenaChallenge;
  } catch {
    return null;
  }
}

export function saveArenaChallenge(c: ArenaChallenge) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHALLENGE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

export function todaysChallengeBrief(
  tickers: string[],
  dayKey = todayKeyInTz()
): { cash: number; note: string; focus: string[] } {
  const pool = [...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))];
  const h = hash(`arena|${dayKey}`);
  const cashOptions = [8_000, 10_000, 12_000, 15_000];
  const cash = cashOptions[h % cashOptions.length]!;
  const focus =
    pool.length <= 3
      ? pool
      : [pool[h % pool.length]!, pool[(h >> 3) % pool.length]!, pool[(h >> 7) % pool.length]!]
          .filter((t, i, a) => a.indexOf(t) === i)
          .slice(0, 3);

  const notes = [
    `Only trade live-book names. Soft spotlight: ${focus.join(", ") || "whatever’s on the board"}.`,
    `Boredom mode: beat today’s live-book day % without touching the real sheets.`,
    `Sandbox only — ${focus.join(" / ") || "book tickers"} are today’s toys.`,
  ];
  return {
    cash,
    note: notes[h % notes.length]!,
    focus,
  };
}

/** Start (or refresh) today’s arena challenge — resets sandbox cash, clears holdings. */
export function startDailyArenaChallenge(input: {
  tickers: string[];
  liveDayPct: number | null;
}): { arena: ArenaState; challenge: ArenaChallenge } {
  const dayKey = todayKeyInTz();
  const brief = todaysChallengeBrief(input.tickers, dayKey);
  const arena: ArenaState = {
    ...defaultArena(),
    cash: brief.cash,
    holdings: [],
    note: `Daily challenge ${dayKey} · ${brief.note}`,
    updatedAt: new Date().toISOString(),
  };
  saveArena(arena);
  const challenge: ArenaChallenge = {
    dayKey,
    tickers: [...new Set(input.tickers.map((t) => t.toUpperCase()))],
    startingCash: brief.cash,
    startNav: brief.cash,
    liveDayPctAtStart: input.liveDayPct,
    note: brief.note,
  };
  saveArenaChallenge(challenge);
  return { arena, challenge };
}

export function arenaChallengeProgress(
  challenge: ArenaChallenge,
  arenaNav: number,
  liveDayPct: number | null
): {
  arenaReturn: number;
  vsLive: number | null;
  sameDay: boolean;
} {
  const arenaReturn =
    challenge.startNav > 0
      ? (arenaNav - challenge.startNav) / challenge.startNav
      : 0;
  const vsLive =
    liveDayPct != null ? arenaReturn - liveDayPct : null;
  return {
    arenaReturn,
    vsLive,
    sameDay: challenge.dayKey === todayKeyInTz(),
  };
}
