/**
 * Last-known market prices, persisted so the first paint after a refresh
 * is a real valuation.
 *
 * Without this, `price = quote?.price ?? h.buy_price` in calculations.ts
 * silently values every holding at its BUY price until the quotes request
 * lands, so the book flashed its cost basis (~$836k) for half a second
 * before snapping to market (~$1,097k). That isn't a stale number, it's a
 * different quantity wearing the same formatting, which is worse: it
 * looks authoritative and is wrong by the entire unrealized gain.
 *
 * A price from a few minutes ago is off by normal drift. Cost basis is off
 * by every gain ever made. So we hydrate from cache and let the refresh
 * (already running within a second) correct it, and we carry `savedAt` so
 * the header's "Prices · Xs ago" tells the truth about the age meanwhile.
 */

import type { Quote } from "@/lib/types";
import { persistQuotesSnapshot } from "@/lib/offline/snapshots";

const KEY = "upside-quotes-v1";
/** Generous: a Friday close is a perfectly good Monday-morning opener. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Tickers accumulate as you browse communities; keep the blob bounded. */
const MAX_TICKERS = 300;

type CachedQuotes = {
  savedAt: number;
  quotes: Record<string, Quote>;
};

export function loadCachedQuotes(): {
  quotes: Record<string, Quote>;
  savedAt: number | null;
} {
  if (typeof window === "undefined") return { quotes: {}, savedAt: null };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { quotes: {}, savedAt: null };
    const parsed = JSON.parse(raw) as CachedQuotes | null;
    if (!parsed?.quotes || typeof parsed.savedAt !== "number") {
      return { quotes: {}, savedAt: null };
    }
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      return { quotes: {}, savedAt: null };
    }
    return { quotes: parsed.quotes, savedAt: parsed.savedAt };
  } catch {
    return { quotes: {}, savedAt: null };
  }
}

/**
 * Yahoo sometimes rolls previousClose up to the live mark overnight, which
 * zeros Today even though the last regular session moved. If a new quote
 * is flat but we already know a real baseline, keep it.
 */
export function mergeQuotes(
  prev: Record<string, Quote>,
  incoming: Record<string, Quote>
): Record<string, Quote> {
  const merged = { ...prev };
  for (const [ticker, q] of Object.entries(incoming)) {
    const old = prev[ticker];
    const incomingFlat =
      q.previousClose > 0 &&
      Math.abs(q.price - q.previousClose) < 1e-6 * Math.max(1, q.price);
    const oldHasMove =
      Boolean(old) &&
      old!.previousClose > 0 &&
      Math.abs(old!.price - old!.previousClose) >
        1e-6 * Math.max(1, old!.previousClose);
    const yahooRolledBaseline =
      Boolean(old) &&
      Math.abs(q.previousClose - old!.previousClose) >
        1e-6 * Math.max(1, old!.previousClose);
    const sameMark =
      Boolean(old) &&
      old!.price > 0 &&
      Math.abs(q.price - old!.price) / old!.price < 0.05;
    const liveRegular =
      (q.marketState ?? "").toUpperCase() === "REGULAR";
    // During the regular session a flat print can be a real $0 day.
    // Overnight, Yahoo rolling previousClose onto the last print is not.
    if (
      !liveRegular &&
      incomingFlat &&
      oldHasMove &&
      yahooRolledBaseline &&
      sameMark
    ) {
      const previousClose = old!.previousClose;
      const change = q.price - previousClose;
      merged[ticker] = {
        ...q,
        previousClose,
        change,
        changePercent: previousClose > 0 ? change / previousClose : 0,
      };
    } else {
      merged[ticker] = q;
    }
  }
  return merged;
}

/** True when live marks (not sparkline identity) match. Lets React bail out. */
export function quotesUnchanged(
  prev: Record<string, Quote>,
  next: Record<string, Quote>
): boolean {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) return false;
  for (const key of nextKeys) {
    const a = prev[key];
    const b = next[key];
    if (!a || !b) return false;
    if (
      a.price !== b.price ||
      a.change !== b.change ||
      a.previousClose !== b.previousClose ||
      a.marketState !== b.marketState ||
      a.preMarketPrice !== b.preMarketPrice ||
      a.postMarketPrice !== b.postMarketPrice
    ) {
      return false;
    }
  }
  return true;
}

/** Merge freshly fetched quotes over whatever's already cached. */
export function saveCachedQuotes(next: Record<string, Quote>) {
  if (typeof window === "undefined") return;
  if (!next || Object.keys(next).length === 0) return;
  try {
    const merged = mergeQuotes(loadCachedQuotes().quotes, next);
    const keys = Object.keys(merged);
    const trimmed =
      keys.length > MAX_TICKERS
        ? Object.fromEntries(
            keys.slice(keys.length - MAX_TICKERS).map((k) => [k, merged[k]!])
          )
        : merged;
    const snap = { savedAt: Date.now(), quotes: trimmed };
    window.localStorage.setItem(KEY, JSON.stringify(snap));
    persistQuotesSnapshot(snap);
  } catch {
    /* ignore quota / private mode */
  }
}
