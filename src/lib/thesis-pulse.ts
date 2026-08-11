import { TICKER_SECTORS } from "@/lib/forecast-plan";
import type { OverviewModel, TickerScore } from "@/lib/overview";
import { todayKeyInTz } from "@/lib/timezone";
import { z } from "zod";

/** Fraction — 0.05 = ±5% day move */
export const PULSE_MOVE_THRESHOLD = 0.05;
/** Fraction of total equity to count as a “big” line */
export const PULSE_MIN_BOOK_PCT = 0.02;

export type PulseCandidate = TickerScore & {
  bookPct: number;
};

export type ThesisStatus = "intact" | "watch" | "broken";

export type PulseCheck = {
  ticker: string;
  moveReason: string;
  thesisStatus: ThesisStatus;
  earningsNote: string;
  verdict: string;
};

export type PulseReport = {
  generatedAt: string;
  summary: string;
  checks: PulseCheck[];
};

export const pulseReportSchema = z.object({
  summary: z
    .string()
    .describe("One plain sentence on book-level mood for today's big movers."),
  checks: z.array(
    z.object({
      ticker: z.string(),
      moveReason: z
        .string()
        .describe(
          "One short sentence: why it moved today (news, sector, earnings reaction, macro)."
        ),
      thesisStatus: z.enum(["intact", "watch", "broken"]),
      earningsNote: z
        .string()
        .describe(
          "Recent or upcoming earnings in plain English; empty string if not relevant."
        ),
      verdict: z
        .string()
        .describe(
          "One actionable sentence: hold, trim, add on dip, or watch — thesis-first."
        ),
    })
  ),
});

const PULSE_CACHE_KEY = "upside-pulse-v1";

export function pickPulseCandidates(
  overview: OverviewModel,
  opts?: {
    moveThreshold?: number;
    minBookPct?: number;
    topByValue?: number;
  }
): PulseCandidate[] {
  const moveThreshold = opts?.moveThreshold ?? PULSE_MOVE_THRESHOLD;
  const minBookPct = opts?.minBookPct ?? PULSE_MIN_BOOK_PCT;
  const topByValue = opts?.topByValue ?? 12;
  const equity = overview.totals.equityValue;

  const bigByValue = overview.tickers.slice(0, topByValue);
  const bigSet = new Set(
    bigByValue
      .filter(
        (t) =>
          equity <= 0 ||
          t.currentValue / equity >= minBookPct ||
          bigByValue.indexOf(t) < 8
      )
      .map((t) => t.ticker)
  );

  return overview.tickers
    .filter((t) => bigSet.has(t.ticker))
    .filter(
      (t) =>
        t.todayPct !== null && Math.abs(t.todayPct) >= moveThreshold
    )
    .map((t) => ({
      ...t,
      bookPct: equity > 0 ? t.currentValue / equity : 0,
    }))
    .sort(
      (a, b) => Math.abs(b.todayPct ?? 0) - Math.abs(a.todayPct ?? 0)
    );
}

export function pulseCacheKey(tickers: string[]): string {
  const day = todayKeyInTz();
  const list = [...tickers].sort().join(",");
  return `${PULSE_CACHE_KEY}:${day}:${list}`;
}

export function loadPulseCache(key: string): PulseReport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as PulseReport;
  } catch {
    return null;
  }
}

export function savePulseCache(key: string, report: PulseReport) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(report));
  } catch {
    /* ignore */
  }
}

export function statusLabel(status: ThesisStatus): string {
  if (status === "intact") return "Thesis intact";
  if (status === "watch") return "Watch";
  return "Thesis at risk";
}

export function sectorForTicker(ticker: string): string | null {
  return TICKER_SECTORS[ticker.toUpperCase()] ?? null;
}
