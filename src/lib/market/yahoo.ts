import type { Quote } from "@/lib/types";
import { normalizeYahooTicker } from "@/lib/ticker";
import { dateKeyInTz, daysUntilInTz } from "@/lib/timezone";

type YahooFinanceInstance = InstanceType<
  typeof import("yahoo-finance2").default
>;

let yahoo: YahooFinanceInstance | null = null;

async function getYahoo(): Promise<YahooFinanceInstance> {
  if (yahoo) return yahoo;
  const { default: YahooFinance } = await import("yahoo-finance2");
  yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return yahoo;
}

function synthesizeSparkline(price: number, changePercent: number): number[] {
  const points = 30;
  const start = price / (1 + changePercent / 100);
  const series: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const drift = start + (price - start) * t;
    const noise = Math.sin(i * 1.7) * price * 0.008;
    series.push(Math.max(0.01, drift + noise));
  }
  series[series.length - 1] = price;
  return series;
}

function hashTicker(ticker: string): number {
  let h = 0;
  for (let i = 0; i < ticker.length; i++) h = (h * 31 + ticker.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export type FxRates = {
  /** USD per 1 EUR — preferred conversion rate (last → prev close → open) */
  eurUsd: number | null;
  /** EURUSD regular session open */
  eurUsdOpen: number | null;
  /** EURUSD previous close */
  eurUsdPreviousClose: number | null;
  /** EURUSD last / regular market price */
  eurUsdLast: number | null;
  /** USD per 1 GBP */
  gbpUsd: number | null;
};

export type QuotesResult = {
  quotes: Record<string, Quote>;
  fx: FxRates;
  /** True when Yahoo failed for some/all tickers and seed fallbacks were used */
  delayed: boolean;
};

/** Raw Yahoo attempt — reports which tickers failed instead of silently
 * papering over them, so a caller can try another provider before falling
 * back to synthetic placeholder data. */
export type YahooQuotesAttempt = {
  quotes: Record<string, Quote>;
  fx: FxRates;
  /** Tickers Yahoo could not price at all. */
  failed: string[];
};

const EMPTY_FX: FxRates = {
  eurUsd: null,
  eurUsdOpen: null,
  eurUsdPreviousClose: null,
  eurUsdLast: null,
  gbpUsd: null,
};

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

async function fetchFxRates(yf: YahooFinanceInstance): Promise<FxRates> {
  try {
    const [eur, gbp] = await Promise.all([
      yf.quote("EURUSD=X"),
      yf.quote("GBPUSD=X"),
    ]);
    const last = numOrNull(eur.regularMarketPrice);
    const open = numOrNull(eur.regularMarketOpen);
    const previousClose = numOrNull(eur.regularMarketPreviousClose);
    const eurUsd = last ?? previousClose ?? open;
    return {
      eurUsd,
      eurUsdOpen: open,
      eurUsdPreviousClose: previousClose,
      eurUsdLast: last,
      gbpUsd: numOrNull(gbp.regularMarketPrice),
    };
  } catch (err) {
    console.error("FX quote failed", err);
    return { ...EMPTY_FX };
  }
}

/** Fetch EURUSD/GBPUSD only (for Compound / empty books). */
export async function fetchFxOnly(): Promise<FxRates> {
  try {
    const yf = await getYahoo();
    return await fetchFxRates(yf);
  } catch (err) {
    console.error("FX-only fetch failed", err);
    return { ...EMPTY_FX };
  }
}

/** Convert a Yahoo native price into USD (SP column is always USD). */
function priceToUsd(
  price: number,
  currency: string | undefined,
  fx: FxRates
): number {
  let px = price;
  let cur = (currency ?? "USD").trim();
  // London often quotes in pence
  if (cur === "GBp" || cur === "GBX") {
    px /= 100;
    cur = "GBP";
  }
  const upper = cur.toUpperCase();
  if (upper === "USD") return px;
  if (upper === "EUR" && fx.eurUsd && fx.eurUsd > 0) return px * fx.eurUsd;
  if (upper === "GBP" && fx.gbpUsd && fx.gbpUsd > 0) return px * fx.gbpUsd;
  return px;
}

function scaleMoney(
  value: number | null,
  nativePrice: number,
  usdPrice: number
): number | null {
  if (value == null || nativePrice <= 0) return value;
  return value * (usdPrice / nativePrice);
}

/** Yahoo-only attempt — no synthetic fallback merged in. */
export async function fetchQuotesYahoo(
  tickers: string[]
): Promise<YahooQuotesAttempt> {
  const unique = [
    ...new Set(
      tickers.map((t) => normalizeYahooTicker(t)).filter(Boolean)
    ),
  ];
  if (unique.length === 0) {
    return { quotes: {}, fx: { ...EMPTY_FX }, failed: [] };
  }

  try {
    const yf = await getYahoo();
    const fx = await fetchFxRates(yf);
    const period1 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const results = await Promise.all(
      unique.map(async (ticker) => {
        try {
          const [quote, chart] = await Promise.all([
            yf.quote(ticker),
            yf.chart(ticker, { period1, interval: "1d" }),
          ]);

          // regularMarketPrice is the last REGULAR-session trade and does
          // NOT move during extended hours — it holds yesterday's (or this
          // morning's pre-open) close, stale, right through an active
          // pre/post-market session. During those specific windows,
          // pre/postMarketPrice are the genuinely current numbers and have
          // to be what "the price" means everywhere in the app, not just a
          // fallback for when regularMarketPrice happens to be missing.
          const state = (
            typeof quote.marketState === "string" ? quote.marketState : ""
          ).toUpperCase();
          const rawRegular = numOrNull(quote.regularMarketPrice);
          const rawPost = numOrNull(quote.postMarketPrice);
          const rawPre = numOrNull(quote.preMarketPrice);
          const nativePrice =
            (state === "POST" || state === "POSTPOST") && rawPost
              ? rawPost
              : (state === "PRE" || state === "PREPRE") && rawPre
                ? rawPre
                : rawRegular ?? rawPost ?? rawPre ?? 0;
          const currency =
            typeof quote.currency === "string" ? quote.currency : undefined;
          const price = priceToUsd(nativePrice, currency, fx);

          const nativePreviousClose =
            numOrNull(quote.regularMarketPreviousClose) ??
            (rawRegular != null && quote.regularMarketChange != null
              ? rawRegular - quote.regularMarketChange
              : nativePrice);
          const previousClose = priceToUsd(nativePreviousClose, currency, fx);
          // Derived directly from (current price vs yesterday's close)
          // instead of reusing Yahoo's own change fields — regularMarket*
          // and postMarket* changes are relative to two DIFFERENT baselines
          // (previous close vs. the regular close), so summing them isn't
          // valid; recomputing from scratch is correct in every session.
          const change = previousClose > 0 ? price - previousClose : 0;
          const changePercent = previousClose > 0 ? change / previousClose : 0;
          const sparkline =
            chart.quotes && chart.quotes.length > 1
              ? chart.quotes
                  .map((row) => row.close)
                  .filter((c): c is number => typeof c === "number")
                  .map((c) => priceToUsd(c, currency, fx))
              : synthesizeSparkline(price, changePercent * 100);

          const preMarketPrice = scaleMoney(
            typeof quote.preMarketPrice === "number"
              ? quote.preMarketPrice
              : null,
            nativePrice,
            price
          );
          const preMarketChange = scaleMoney(
            typeof quote.preMarketChange === "number"
              ? quote.preMarketChange
              : null,
            nativePrice,
            price
          );
          const preMarketChangePercent =
            typeof quote.preMarketChangePercent === "number"
              ? quote.preMarketChangePercent / 100
              : null;
          const postMarketPrice = scaleMoney(
            typeof quote.postMarketPrice === "number"
              ? quote.postMarketPrice
              : null,
            nativePrice,
            price
          );
          const postMarketChange = scaleMoney(
            typeof quote.postMarketChange === "number"
              ? quote.postMarketChange
              : null,
            nativePrice,
            price
          );
          const postMarketChangePercent =
            typeof quote.postMarketChangePercent === "number"
              ? quote.postMarketChangePercent / 100
              : null;
          const marketState =
            typeof quote.marketState === "string" ? quote.marketState : null;

          return [
            ticker,
            {
              ticker,
              price,
              change,
              changePercent,
              previousClose,
              sparkline,
              marketState,
              preMarketPrice,
              preMarketChange,
              preMarketChangePercent,
              postMarketPrice,
              postMarketChange,
              postMarketChangePercent,
            } satisfies Quote,
          ] as const;
        } catch (err) {
          console.error(`Quote failed for ${ticker}`, err);
          return null;
        }
      })
    );

    const map: Record<string, Quote> = {};
    for (const row of results) {
      if (row) map[row[0]] = row[1];
    }

    const failed = unique.filter((ticker) => !map[ticker]);
    return { quotes: map, fx, failed };
  } catch (err) {
    console.error("yahoo-finance2 unavailable", err);
    return {
      quotes: {},
      fx: { ...EMPTY_FX },
      failed: unique,
    };
  }
}

/** Synthetic placeholder prices — absolute last resort when every real
 * provider (Yahoo, and any configured fallback providers) failed. Not real
 * market data; callers should surface `delayed`/degraded state to the UI. */
export function fallbackQuotes(tickers: string[]): Record<string, Quote> {
  const seeds: Record<string, number> = {
    NBIS: 162.4,
    CRWV: 68.2,
    RKLB: 48.9,
    BMNR: 22.1,
    VST: 178.5,
    AAPL: 214.2,
    MSFT: 425.1,
  };

  const map: Record<string, Quote> = {};
  for (const ticker of tickers) {
    const price = seeds[ticker] ?? 100;
    const changePercent = ((hashTicker(ticker) % 20) - 10) / 1000;
    const change = price * changePercent;
    map[ticker] = {
      ticker,
      price,
      change,
      changePercent,
      previousClose: price - change,
      sparkline: synthesizeSparkline(price, changePercent * 100),
      marketState: null,
      preMarketPrice: null,
      preMarketChange: null,
      preMarketChangePercent: null,
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePercent: null,
    };
  }
  return map;
}

export type EarningsEvent = {
  ticker: string;
  date: string;
  days: number;
};

export type CatalystEvent = {
  ticker: string;
  label: string;
  date: string | null;
  days: number | null;
  kind: "earnings" | "theme";
};

/** Soft thematic catalysts — dated earnings come from Yahoo. */
const THEME_CATALYSTS: Record<string, string[]> = {
  NBIS: ["AI infra / capacity narrative"],
  CRWV: ["Cloud GPU demand & utilization"],
  RKLB: ["Launch cadence / Neutron progress"],
  BMNR: ["Crypto treasury / ETH beta"],
  VST: ["Power demand / data-center electricity"],
  NVDA: ["AI chip cycle & guidance"],
  AVGO: ["Custom AI ASIC / networking"],
  RDDT: ["Ad cycle & user growth prints"],
};

function toDateKey(d: Date): string {
  return dateKeyInTz(d);
}

export async function fetchNextEarningsDate(
  ticker: string
): Promise<Date | null> {
  try {
    const yf = await getYahoo();
    const summary = await yf.quoteSummary(ticker, {
      modules: ["earnings", "calendarEvents"],
    });

    const fromEarnings = summary.earnings?.earningsChart?.earningsDate?.[0];
    const fromCalendar =
      summary.calendarEvents?.earnings?.earningsDate?.[0] ??
      summary.calendarEvents?.earnings?.earningsDate?.[1];

    const raw = fromEarnings ?? fromCalendar;
    if (!raw) return null;
    const d = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch (err) {
    console.error(`Earnings lookup failed for ${ticker}`, err);
    return null;
  }
}

export async function fetchMarketEvents(tickers: string[]): Promise<{
  earnings: EarningsEvent[];
  catalysts: CatalystEvent[];
}> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))];

  const earnings: EarningsEvent[] = [];
  const catalysts: CatalystEvent[] = [];

  await Promise.all(
    unique.map(async (ticker) => {
      const date = await fetchNextEarningsDate(ticker);
      if (date) {
        const days = daysUntilInTz(date);
        // Upcoming only (Tallinn calendar) — drop yesterday/past
        if (days >= 0 && days <= 90) {
          const row: EarningsEvent = {
            ticker,
            date: toDateKey(date),
            days,
          };
          earnings.push(row);
          catalysts.push({
            ticker,
            label: "Earnings report",
            date: row.date,
            days: row.days,
            kind: "earnings",
          });
        }
      }

      for (const label of THEME_CATALYSTS[ticker] ?? []) {
        catalysts.push({
          ticker,
          label,
          date: null,
          days: null,
          kind: "theme",
        });
      }
    })
  );

  earnings.sort((a, b) => a.days - b.days);
  catalysts.sort((a, b) => {
    if (a.days === null && b.days === null) return a.ticker.localeCompare(b.ticker);
    if (a.days === null) return 1;
    if (b.days === null) return -1;
    return a.days - b.days;
  });

  return { earnings, catalysts };
}
