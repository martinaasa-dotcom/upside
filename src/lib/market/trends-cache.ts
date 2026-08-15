/**
 * SWR (Stale-While-Revalidate) in-memory and edge cache for weekly market trends.
 * Minimizes redundant historical bar fetches and indicator calculations during
 * volatile market sessions.
 */

import { normalizeYahooTicker } from "@/lib/ticker";
import {
  macd,
  nWeekChange,
  relativeStrength,
  rsi,
  rsiDivergence,
  toWeekly,
  trendRegime,
  type Bar,
  type TrendRegime,
} from "@/lib/market/indicators";

export type TrendRow = {
  ticker: string;
  regime: TrendRegime;
  aboveLongMa: boolean | null;
  rsi: number | null;
  macdHistogram: number | null;
  macdBuilding: boolean | null;
  divergence: {
    kind: "bearish" | "bullish";
    weeksAgo: number;
    priceFrom: number;
    priceTo: number;
    rsiFrom: number;
    rsiTo: number;
  } | null;
  rs13: number | null;
  rs26: number | null;
  /** Raw price change over the last 2 / 4 weekly closes — fast enough to
   * catch a post-earnings re-rate before the slow trend/momentum reads
   * below catch up to it. */
  chg2w: number | null;
  chg4w: number | null;
  lastClose: number | null;
  longMa: number | null;
  vsLongMaPct: number | null;
  longSlopePct: number | null;
  macdHistogramPrev: number | null;
};

type YahooFinanceInstance = InstanceType<
  typeof import("yahoo-finance2").default
>;
let yahooInstance: YahooFinanceInstance | null = null;
async function getYahoo(): Promise<YahooFinanceInstance> {
  if (yahooInstance) return yahooInstance;
  const { default: YahooFinance } = await import("yahoo-finance2");
  yahooInstance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return yahooInstance;
}

export const BENCHMARK = "SPY";
const YEARS_BACK = 4;
export const MAX_TICKERS = 14;

// Cache timings
const FRESH_TTL_MS = 10 * 60 * 1000; // 10 minutes fresh
const STALE_TTL_MS = 60 * 60 * 1000; // 60 minutes stale-while-revalidate
const MAX_CACHE_SIZE = 250;

type CachedCloses = {
  closes: number[];
  cachedAt: number;
};

type CachedTrendRow = {
  row: TrendRow;
  cachedAt: number;
};

const CLOSES_CACHE = new Map<string, CachedCloses>();
const ROW_CACHE = new Map<string, CachedTrendRow>();
const IN_FLIGHT_CLOSES = new Map<string, Promise<number[] | null>>();

function pruneCacheIfNeeded() {
  if (CLOSES_CACHE.size > MAX_CACHE_SIZE) {
    const sorted = [...CLOSES_CACHE.entries()].sort(
      (a, b) => a[1].cachedAt - b[1].cachedAt
    );
    for (let i = 0; i < 50; i++) {
      if (sorted[i]) {
        CLOSES_CACHE.delete(sorted[i][0]);
        ROW_CACHE.delete(sorted[i][0]);
      }
    }
  }
}

async function fetchWeeklyClosesUncached(
  ticker: string
): Promise<number[] | null> {
  try {
    const yf = await getYahoo();
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - YEARS_BACK);
    const chart = await yf.chart(normalizeYahooTicker(ticker), {
      period1,
      interval: "1d",
    });
    const bars: Bar[] = [];
    for (const row of chart.quotes ?? []) {
      const raw = row.date as Date | string | undefined;
      const close = typeof row.close === "number" ? row.close : null;
      if (!raw || close == null || !Number.isFinite(close)) continue;
      const date =
        raw instanceof Date
          ? raw.toISOString().slice(0, 10)
          : String(raw).slice(0, 10);
      bars.push({ date, close });
    }
    if (bars.length < 60) return null;
    return toWeekly(bars).map((b) => b.close);
  } catch {
    return null;
  }
}

export async function getWeeklyCloses(
  ticker: string,
  opts?: { force?: boolean }
): Promise<number[] | null> {
  const symbol = ticker.toUpperCase();
  const now = Date.now();
  const cached = CLOSES_CACHE.get(symbol);

  // Return fresh cache immediately
  if (!opts?.force && cached && now - cached.cachedAt < FRESH_TTL_MS) {
    return cached.closes;
  }

  // If in-flight, reuse promise to deduplicate concurrent requests
  const inFlight = IN_FLIGHT_CLOSES.get(symbol);
  if (inFlight) {
    return inFlight;
  }

  // If stale, return stale immediately and revalidate in background
  if (!opts?.force && cached && now - cached.cachedAt < STALE_TTL_MS) {
    const backgroundPromise = fetchWeeklyClosesUncached(symbol)
      .then((closes) => {
        if (closes && closes.length >= 30) {
          CLOSES_CACHE.set(symbol, { closes, cachedAt: Date.now() });
          pruneCacheIfNeeded();
        }
        return closes;
      })
      .finally(() => {
        IN_FLIGHT_CLOSES.delete(symbol);
      });
    IN_FLIGHT_CLOSES.set(symbol, backgroundPromise);
    return cached.closes;
  }

  // Fetch fresh
  const fetchPromise = fetchWeeklyClosesUncached(symbol)
    .then((closes) => {
      if (closes && closes.length >= 30) {
        CLOSES_CACHE.set(symbol, { closes, cachedAt: Date.now() });
        pruneCacheIfNeeded();
      }
      return closes;
    })
    .finally(() => {
      IN_FLIGHT_CLOSES.delete(symbol);
    });

  IN_FLIGHT_CLOSES.set(symbol, fetchPromise);
  return fetchPromise;
}

export async function fetchTrendsBatch(
  tickers: string[],
  opts?: { force?: boolean }
): Promise<{
  rows: TrendRow[];
  benchmark: string;
  cachedCount: number;
  freshCount: number;
  asOf: string;
}> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))].slice(
    0,
    MAX_TICKERS
  );
  if (unique.length === 0) {
    return {
      rows: [],
      benchmark: BENCHMARK,
      cachedCount: 0,
      freshCount: 0,
      asOf: new Date().toISOString(),
    };
  }

  const now = Date.now();
  let cachedCount = 0;
  let freshCount = 0;

  // Track cache hits
  for (const t of unique) {
    const rowEntry = ROW_CACHE.get(t);
    if (!opts?.force && rowEntry && now - rowEntry.cachedAt < FRESH_TTL_MS) {
      cachedCount++;
    } else {
      freshCount++;
    }
  }

  const symbols = [...new Set([...unique, BENCHMARK])];
  const settled = await Promise.all(
    symbols.map(async (t) => [t, await getWeeklyCloses(t, opts)] as const)
  );
  const bySymbol = new Map(settled);
  const bench = bySymbol.get(BENCHMARK) ?? null;

  const rows: TrendRow[] = [];
  for (const ticker of unique) {
    // Check if row calculation is cached and valid
    const cachedRow = ROW_CACHE.get(ticker);
    if (
      !opts?.force &&
      cachedRow &&
      now - cachedRow.cachedAt < FRESH_TTL_MS
    ) {
      rows.push(cachedRow.row);
      continue;
    }

    const closes = bySymbol.get(ticker);
    if (!closes || closes.length < 30) continue;

    const rsiSeries = rsi(closes, 14);
    const m = macd(closes);
    const regime = trendRegime(closes);
    const div = rsiDivergence(closes, rsiSeries, { window: 3, maxBarsAgo: 8 });
    const hist = m.histogram.at(-1) ?? null;
    const histPrev = m.histogram.at(-4) ?? null;

    const row: TrendRow = {
      ticker,
      regime: regime.regime,
      aboveLongMa: regime.aboveLong,
      rsi: rsiSeries.at(-1) ?? null,
      macdHistogram: hist,
      macdHistogramPrev: histPrev,
      macdBuilding: hist != null && histPrev != null ? hist > histPrev : null,
      divergence: div
        ? {
            kind: div.kind,
            weeksAgo: div.barsAgo,
            priceFrom: div.priceFrom,
            priceTo: div.priceTo,
            rsiFrom: div.rsiFrom,
            rsiTo: div.rsiTo,
          }
        : null,
      rs13: bench ? relativeStrength(closes, bench, 13) : null,
      rs26: bench ? relativeStrength(closes, bench, 26) : null,
      chg2w: nWeekChange(closes, 2),
      chg4w: nWeekChange(closes, 4),
      lastClose: closes.at(-1) ?? regime.price,
      longMa: regime.longMa,
      vsLongMaPct:
        regime.longMa != null &&
        regime.price != null &&
        regime.longMa > 0
          ? regime.price / regime.longMa - 1
          : null,
      longSlopePct: regime.longSlopePct,
    };

    ROW_CACHE.set(ticker, { row, cachedAt: Date.now() });
    rows.push(row);
  }

  return {
    rows,
    benchmark: BENCHMARK,
    cachedCount,
    freshCount,
    asOf: new Date().toISOString(),
  };
}
