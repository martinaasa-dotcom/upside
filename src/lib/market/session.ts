/**
 * Where the US market is in its day, for anything that polls.
 *
 * Pre-market (04:00) through after-hours (20:00) still prints, so those
 * windows poll as often as the regular session. Nights and weekends slow
 * down; they do not freeze on a flattened close.
 */

import { dateKeyInTz } from "@/lib/timezone";
import type { Quote } from "@/lib/types";

const US_TZ = "America/New_York";

export type MarketSession = "open" | "extended" | "closed";

/** Minutes since midnight in New York, plus the weekday there. */
function nyClock(at: Date): { minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: US_TZ,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    get("weekday")
  );

  return { minutes: hour * 60 + minute, weekday };
}

export function marketSession(at: Date = new Date()): MarketSession {
  const { minutes, weekday } = nyClock(at);
  if (weekday === 0 || weekday === 6) return "closed";
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return "open";
  // Pre-market from 04:00, after-hours to 20:00. Holidays aren't tracked; a
  // holiday just costs one slow poll cycle, which is cheap.
  if (minutes >= 4 * 60 && minutes < 20 * 60) return "extended";
  return "closed";
}

/** How often live prices are worth re-fetching right now, in ms. */
export function quotePollMs(at: Date = new Date()): number {
  const session = marketSession(at);
  if (session === "open" || session === "extended") return 45_000;
  const { weekday } = nyClock(at);
  if (weekday === 0 || weekday === 6) return 15 * 60_000;
  return 2 * 60_000;
}

/** True when a quote fetch this recent is still inside the current poll cadence. */
export function isQuotePollFresh(
  updatedAt: number | null | undefined,
  at: Date = new Date()
): boolean {
  if (updatedAt == null || !Number.isFinite(updatedAt)) return false;
  const age = Date.now() - updatedAt;
  return age >= 0 && age < quotePollMs(at);
}

/**
 * Stable /api/quotes URL for a ticker set. Sorted and deduped so two tabs
 * asking for the same names in a different order share one cache entry
 * instead of each paying for its own upstream fetch.
 */
export function quotesUrl(tickers: readonly string[]): string {
  const list = [...new Set(tickers.map((t) => t.trim().toUpperCase()))]
    .filter(Boolean)
    .sort();
  return `/api/quotes?tickers=${encodeURIComponent(list.join(","))}`;
}

function addDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const next = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days));
  return next.toISOString().slice(0, 10);
}

function isWeekendKey(key: string): boolean {
  const [y, m, d] = key.split("-").map(Number);
  const dow = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12)).getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * US cash-session date the fund should write. After 16:00 ET on a weekday
 * that is today. Before the close, weekends, or Monday morning, that is
 * the previous weekday. 21:30 UTC is 17:30 ET in summer, so the evening
 * cron lands on the session that just ended, not Tallinn's next morning.
 */
export function lastCompletedUsSessionKey(now: Date = new Date()): string {
  const { minutes, weekday } = nyClock(now);
  let key = dateKeyInTz(now, US_TZ);
  const closedToday =
    weekday !== 0 && weekday !== 6 && minutes >= 16 * 60;
  if (closedToday) return key;
  key = addDayKey(key, -1);
  for (let i = 0; i < 6; i++) {
    if (!isWeekendKey(key)) return key;
    key = addDayKey(key, -1);
  }
  return key;
}

/**
 * A morning catch-up is writing yesterday. Live prints are today's
 * session, so pin each name to previousClose (yesterday's regular close).
 */
export function pinQuotesToSessionClose(
  quotes: Record<string, Quote>,
  sessionDate: string,
  now: Date = new Date()
): Record<string, Quote> {
  if (sessionDate >= dateKeyInTz(now, US_TZ)) return quotes;
  const next: Record<string, Quote> = {};
  for (const [ticker, q] of Object.entries(quotes)) {
    const close = q.previousClose;
    if (!(close > 0)) {
      next[ticker] = q;
      continue;
    }
    next[ticker] = { ...q, price: close, change: 0, changePercent: 0 };
  }
  return next;
}
