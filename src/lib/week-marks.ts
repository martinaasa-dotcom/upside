/** Local week of visits. Powers the Sunday look without a new model call. */

import { todayKeyInTz } from "@/lib/timezone";

const KEY = "upside-week-marks-v1";

export type WeekDayMark = {
  dayKey: string;
  totalValue: number;
  todayDollar: number;
  bestTicker: string | null;
  bestPct: number | null;
  worstTicker: string | null;
  worstPct: number | null;
};

export type WeekMarks = {
  weekKey: string;
  days: WeekDayMark[];
};

function mondayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const wd = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - wd);
  return dt.toISOString().slice(0, 10);
}

function loadRaw(): WeekMarks {
  if (typeof window === "undefined") {
    return { weekKey: mondayKey(todayKeyInTz()), days: [] };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { weekKey: mondayKey(todayKeyInTz()), days: [] };
    const parsed = JSON.parse(raw) as WeekMarks;
    if (!parsed?.weekKey || !Array.isArray(parsed.days)) {
      return { weekKey: mondayKey(todayKeyInTz()), days: [] };
    }
    return {
      weekKey: parsed.weekKey,
      days: parsed.days.map((d) => ({
        dayKey: d.dayKey,
        totalValue: Number(d.totalValue) || 0,
        todayDollar: Number(d.todayDollar) || 0,
        bestTicker: d.bestTicker ?? null,
        bestPct: d.bestPct ?? null,
        worstTicker: d.worstTicker ?? null,
        worstPct: d.worstPct ?? null,
      })),
    };
  } catch {
    return { weekKey: mondayKey(todayKeyInTz()), days: [] };
  }
}

export function loadWeekMarks(): WeekMarks {
  const weekKey = mondayKey(todayKeyInTz());
  const prev = loadRaw();
  if (prev.weekKey !== weekKey) return { weekKey, days: [] };
  return prev;
}

export function recordWeekMark(input: {
  totalValue: number;
  todayDollar: number;
  bestTicker?: string | null;
  bestPct?: number | null;
  worstTicker?: string | null;
  worstPct?: number | null;
}): WeekMarks {
  const dayKey = todayKeyInTz();
  const weekKey = mondayKey(dayKey);
  const prev = loadRaw();
  const base = prev.weekKey === weekKey ? prev.days : [];
  const days = [
    ...base.filter((d) => d.dayKey !== dayKey),
    {
      dayKey,
      totalValue: input.totalValue,
      todayDollar: input.todayDollar,
      bestTicker: input.bestTicker ?? null,
      bestPct: input.bestPct ?? null,
      worstTicker: input.worstTicker ?? null,
      worstPct: input.worstPct ?? null,
    },
  ].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  const next = { weekKey, days };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}
