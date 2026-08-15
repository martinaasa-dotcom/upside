import type { Quote } from "@/lib/types";

export type WatchLookKind = "look" | "wait" | "quiet" | "report";

export type WatchLook = {
  kind: WatchLookKind;
  headline: string;
  detail: string;
  low: number | null;
  high: number | null;
};

const RECENT_DAYS = 20;
const HARD_DAY = 0.04;
const RANGE_FLOOR = 0.015;
const LOW_BAND = 0.22;
const HIGH_BAND = 0.82;
const REPORT_WINDOW = 7;

function recentPrices(quote: Pick<Quote, "price" | "sparkline">): number[] {
  const series = (quote.sparkline ?? []).filter(
    (n) => Number.isFinite(n) && n > 0
  );
  const price = Number.isFinite(quote.price) && quote.price > 0 ? quote.price : null;
  const all = price ? [...series, price] : series;
  return all.slice(-RECENT_DAYS);
}

function rangeOf(prices: number[]): { low: number; high: number } | null {
  if (prices.length < 5) return null;
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  if (!(low > 0) || high <= low) return null;
  return { low, high };
}

function reportLook(
  days: number,
  low: number | null,
  high: number | null
): WatchLook {
  const when =
    days <= 0
      ? "Results today"
      : days === 1
        ? "Results tomorrow"
        : `Results in ${days} days`;
  return {
    kind: "report",
    headline: when,
    detail: "Wait until after if you don't want a surprise move.",
    low,
    high,
  };
}

/**
 * A plain read of recent prices. Not a target and not a buy order.
 * Uses this name's own last few weeks, plus an upcoming results date
 * when we have one.
 */
export function watchLook(
  quote: Pick<Quote, "price" | "changePercent" | "sparkline">,
  daysUntilReport: number | null = null
): WatchLook {
  const prices = recentPrices(quote);
  const band = rangeOf(prices);
  const low = band?.low ?? null;
  const high = band?.high ?? null;
  const price = quote.price;
  const dayPct = Number.isFinite(quote.changePercent) ? quote.changePercent : 0;

  if (
    daysUntilReport != null &&
    Number.isFinite(daysUntilReport) &&
    daysUntilReport >= 0 &&
    daysUntilReport <= REPORT_WINDOW
  ) {
    return reportLook(Math.round(daysUntilReport), low, high);
  }

  if (band && price > 0) {
    const spanPct = (band.high - band.low) / price;
    const pos = (price - band.low) / (band.high - band.low);
    if (spanPct >= RANGE_FLOOR && pos <= LOW_BAND) {
      return {
        kind: "look",
        headline: "Near its recent low",
        detail:
          "A quieter price than it's been. Start small only if you still like why you'd own it.",
        low,
        high,
      };
    }
    if (spanPct >= RANGE_FLOOR && pos >= HIGH_BAND) {
      return {
        kind: "wait",
        headline: "Near its recent high",
        detail:
          "Wait for a cooler day. Buying at the recent high leaves less room if the price comes back down.",
        low,
        high,
      };
    }
  }

  if (dayPct <= -HARD_DAY) {
    return {
      kind: "look",
      headline: "Down a lot today",
      detail:
        "Only interesting if the reason you like it didn't change. Don't buy just because it's cheaper today.",
      low,
      high,
    };
  }
  if (dayPct >= HARD_DAY) {
    return {
      kind: "wait",
      headline: "Up a lot today",
      detail:
        "Late to rush in. Let it sit unless you already planned to buy.",
      low,
      high,
    };
  }

  if (!band) {
    return {
      kind: "quiet",
      headline: "Not enough recent history",
      detail: "Watch the next few days. We'll have a clearer read once prices fill in.",
      low,
      high,
    };
  }

  return {
    kind: "quiet",
    headline: "In the middle of where it's been lately",
    detail: "No rush. Check again if the price jumps or drops hard.",
    low,
    high,
  };
}
