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

/** Merge freshly fetched quotes over whatever's already cached. */
export function saveCachedQuotes(next: Record<string, Quote>) {
  if (typeof window === "undefined") return;
  if (!next || Object.keys(next).length === 0) return;
  try {
    const merged = { ...loadCachedQuotes().quotes, ...next };
    // Newly written tickers are the ones being looked at, so drop from the
    // front (oldest insertion) if the blob grows past the cap.
    const keys = Object.keys(merged);
    const trimmed =
      keys.length > MAX_TICKERS
        ? Object.fromEntries(
            keys.slice(keys.length - MAX_TICKERS).map((k) => [k, merged[k]!])
          )
        : merged;
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ savedAt: Date.now(), quotes: trimmed })
    );
  } catch {
    /* ignore quota / private mode */
  }
}
