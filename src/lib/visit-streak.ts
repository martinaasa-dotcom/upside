/**
 * Personal daily-visit streak (Duolingo-style) — purely local to this
 * browser/device. Different people opening the same book from different
 * devices each get their own streak.
 */
import { todayKeyInTz } from "@/lib/timezone";

const KEY = "upside-visit-streak-v1";
const MAX_RECENT_DAYS = 14;

/** Streak milestones that trigger a one-time celebration toast. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365] as const;

export type VisitStreakState = {
  lastVisitDayKey: string | null;
  currentStreak: number;
  longestStreak: number;
  totalVisits: number;
  /** Day keys visited, oldest first, capped — powers a "week strip" UI. */
  recentDays: string[];
};

function defaultStreak(): VisitStreakState {
  return {
    lastVisitDayKey: null,
    currentStreak: 0,
    longestStreak: 0,
    totalVisits: 0,
    recentDays: [],
  };
}

export function loadVisitStreak(): VisitStreakState {
  if (typeof window === "undefined") return defaultStreak();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultStreak();
    return { ...defaultStreak(), ...(JSON.parse(raw) as VisitStreakState) };
  } catch {
    return defaultStreak();
  }
}

function saveVisitStreak(state: VisitStreakState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Integer day difference (b − a) for two "YYYY-MM-DD" keys, DST-safe. */
function daysBetweenKeys(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00Z`).getTime();
  const db = new Date(`${b}T12:00:00Z`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return NaN;
  return Math.round((db - da) / 86400000);
}

/**
 * Call once per app load. Bumps the streak at most once per Tallinn
 * calendar day, so it's safe to call on every mount/refresh.
 */
export function recordVisitToday(
  dayKey: string = todayKeyInTz()
): {
  state: VisitStreakState;
  isNewToday: boolean;
  justHitMilestone: number | null;
} {
  const prev = loadVisitStreak();
  if (prev.lastVisitDayKey === dayKey) {
    return { state: prev, isNewToday: false, justHitMilestone: null };
  }

  const gap = prev.lastVisitDayKey
    ? daysBetweenKeys(prev.lastVisitDayKey, dayKey)
    : null;
  const nextStreak = gap === 1 ? prev.currentStreak + 1 : 1;
  const recentDays = [...prev.recentDays, dayKey].slice(-MAX_RECENT_DAYS);

  const next: VisitStreakState = {
    lastVisitDayKey: dayKey,
    currentStreak: nextStreak,
    longestStreak: Math.max(prev.longestStreak, nextStreak),
    totalVisits: prev.totalVisits + 1,
    recentDays,
  };
  saveVisitStreak(next);

  const justHitMilestone = (STREAK_MILESTONES as readonly number[]).includes(
    nextStreak
  )
    ? nextStreak
    : null;

  return { state: next, isNewToday: true, justHitMilestone };
}

/** Last 7 Tallinn days, oldest first — true where the streak covered that day. */
export function last7DaysStrip(
  state: VisitStreakState,
  todayKey: string = todayKeyInTz()
): boolean[] {
  const visited = new Set(state.recentDays);
  const base = new Date(`${todayKey}T12:00:00Z`).getTime();
  const out: boolean[] = [];
  for (let i = 6; i >= 0; i--) {
    const key = new Date(base - i * 86400000).toISOString().slice(0, 10);
    out.push(visited.has(key));
  }
  return out;
}

/** Snarky, in-app-voice copy for the current streak length. */
export function streakFlavor(streak: number): string {
  if (streak <= 0) return "No streak yet, today's a great day to start one.";
  if (streak === 1) return "Day 1. Historic. Frame it.";
  if (streak === 2) return "2 days. A tiny habit is forming.";
  if (streak < 7) return `${streak}-day streak. The algorithm is proud of you.`;
  if (streak < 14) return `${streak} days straight. Certified degenerate (affectionate).`;
  if (streak < 30) return `${streak} days. Your broker knows your face by now.`;
  if (streak < 60) return `${streak}-day streak. This is basically a personality trait now.`;
  if (streak < 100) return `${streak} days. Send help (or don't, you're thriving).`;
  return `${streak} days. Certified market menace.`;
}

export function milestoneToast(days: number): string {
  return `🔥 ${days}-day streak unlocked. ${streakFlavor(days)}`;
}
