/** Who took each Circle session this week. Local to this browser. */

import { isNyWeekday } from "@/lib/market-session";
import { todayKeyInTz } from "@/lib/timezone";

const KEY = "upside-circle-board-v1";

type DayWin = { dayKey: string; name: string };
type Store = Record<string, DayWin[]>;

function mondayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const wd = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - wd);
  return dt.toISOString().slice(0, 10);
}

function load(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function save(store: Store) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function recordCircleSession(
  communityId: string,
  winnerName: string
) {
  if (!isNyWeekday()) return;
  const dayKey = todayKeyInTz();
  const week = mondayKey(dayKey);
  const store = load();
  const rows = (store[communityId] ?? []).filter(
    (r) => mondayKey(r.dayKey) === week
  );
  const next = [
    ...rows.filter((r) => r.dayKey !== dayKey),
    { dayKey, name: winnerName },
  ];
  store[communityId] = next;
  save(store);
}

export function circleWeekBoard(
  communityId: string
): { name: string; wins: number } | null {
  const dayKey = todayKeyInTz();
  const week = mondayKey(dayKey);
  const rows = (load()[communityId] ?? []).filter(
    (r) => mondayKey(r.dayKey) === week
  );
  if (rows.length === 0) return null;
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top) return null;
  return { name: top[0], wins: top[1] };
}
