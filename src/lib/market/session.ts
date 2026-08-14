/**
 * Where the US market is in its day, for anything that polls.
 *
 * Pre-market (04:00) through after-hours (20:00) still prints, so those
 * windows poll as often as the regular session. Nights and weekends slow
 * down; they do not freeze on a flattened close.
 */

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
