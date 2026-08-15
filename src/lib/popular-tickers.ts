/** The 30 names people have been watching most this month. */

export const POPULAR_TICKER_COUNT = 30;

/**
 * Used when Yahoo is down or the monthly snapshot is missing.
 * Generic liquid names, not anyone's personal book.
 */
export const FALLBACK_POPULAR_TICKERS: readonly string[] = [
  "NVDA",
  "AAPL",
  "MSFT",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "AVGO",
  "AMD",
  "NFLX",
  "SPY",
  "QQQ",
  "IWM",
  "JPM",
  "V",
  "MA",
  "COST",
  "WMT",
  "XOM",
  "JNJ",
  "UNH",
  "LLY",
  "PLTR",
  "COIN",
  "HOOD",
  "MSTR",
  "SMCI",
  "IONQ",
  "SOFI",
  "DIS",
];

const TICKER_RE = /^[A-Z]{1,5}([.-][A-Z])?$/;

export function currentPopularMonth(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function isPopularTicker(raw: string): boolean {
  return TICKER_RE.test(raw.trim().toUpperCase());
}

export function sanitizePopularTickers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...FALLBACK_POPULAR_TICKERS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const t = String(item ?? "")
      .trim()
      .toUpperCase();
    if (!isPopularTicker(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= POPULAR_TICKER_COUNT) break;
  }
  if (out.length >= POPULAR_TICKER_COUNT) return out;
  for (const t of FALLBACK_POPULAR_TICKERS) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= POPULAR_TICKER_COUNT) break;
  }
  return out;
}

export type PopularTickersPayload = {
  month: string;
  tickers: string[];
  source: "month" | "live" | "fallback";
};
