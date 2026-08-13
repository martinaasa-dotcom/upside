/**
 * Where the US market is in its day, for anything that polls.
 *
 * Every open tab used to hit the quote chain every 45 seconds around the
 * clock. Outside 09:30-16:00 New York the numbers cannot change, so that was
 * roughly 1,900 requests a day per tab spent re-fetching yesterday's close
 * against free-tier rate limits shared by every user.
 *
 * Pre-market and after-hours still move, just thinly, so they get a slower
 * poll rather than none.
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
  switch (marketSession(at)) {
    case "open":
      return 45_000;
    case "extended":
      return 5 * 60_000;
    case "closed":
      return 20 * 60_000;
  }
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
