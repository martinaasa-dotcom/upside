import type { Quote } from "@/lib/types";

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

export type QuotesResult = {
  quotes: Record<string, Quote>;
  /** True when Yahoo failed for some/all tickers and seed fallbacks were used */
  delayed: boolean;
};

export async function fetchQuotes(tickers: string[]): Promise<QuotesResult> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return { quotes: {}, delayed: false };

  try {
    const yf = await getYahoo();
    const period1 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const results = await Promise.all(
      unique.map(async (ticker) => {
        try {
          const [quote, chart] = await Promise.all([
            yf.quote(ticker),
            yf.chart(ticker, { period1, interval: "1d" }),
          ]);

          const price =
            quote.regularMarketPrice ??
            quote.postMarketPrice ??
            quote.preMarketPrice ??
            0;
          const change = quote.regularMarketChange ?? 0;
          const changePercent = (quote.regularMarketChangePercent ?? 0) / 100;
          const previousClose =
            quote.regularMarketPreviousClose ?? price - change;
          const sparkline =
            chart.quotes && chart.quotes.length > 1
              ? chart.quotes
                  .map((row) => row.close)
                  .filter((c): c is number => typeof c === "number")
              : synthesizeSparkline(price, changePercent * 100);

          const preMarketPrice =
            typeof quote.preMarketPrice === "number"
              ? quote.preMarketPrice
              : null;
          const preMarketChange =
            typeof quote.preMarketChange === "number"
              ? quote.preMarketChange
              : null;
          const preMarketChangePercent =
            typeof quote.preMarketChangePercent === "number"
              ? quote.preMarketChangePercent / 100
              : null;
          const postMarketPrice =
            typeof quote.postMarketPrice === "number"
              ? quote.postMarketPrice
              : null;
          const postMarketChange =
            typeof quote.postMarketChange === "number"
              ? quote.postMarketChange
              : null;
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

    let delayed = false;
    // Fill any missing tickers with fallback so UI stays complete
    for (const ticker of unique) {
      if (!map[ticker]) {
        delayed = true;
        Object.assign(map, fallbackQuotes([ticker]));
      }
    }
    return { quotes: map, delayed };
  } catch (err) {
    console.error("yahoo-finance2 unavailable", err);
    return { quotes: fallbackQuotes(unique), delayed: true };
  }
}

function fallbackQuotes(tickers: string[]): Record<string, Quote> {
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
  return d.toISOString().slice(0, 10);
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const earnings: EarningsEvent[] = [];
  const catalysts: CatalystEvent[] = [];

  await Promise.all(
    unique.map(async (ticker) => {
      const date = await fetchNextEarningsDate(ticker);
      if (date) {
        const days = Math.round(
          (date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
        );
        if (days >= -1 && days <= 90) {
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
