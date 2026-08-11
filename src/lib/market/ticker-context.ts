import { dateKeyInTz, daysUntilInTz } from "@/lib/timezone";
import { sectorForTicker, type PulseHeadline } from "@/lib/thesis-pulse";
import { unstable_cache } from "next/cache";

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

export type TickerPulseContext = {
  ticker: string;
  sector: string | null;
  lastEarningsDate: string | null;
  daysSinceLastEarnings: number | null;
  nextEarningsDate: string | null;
  daysUntilNextEarnings: number | null;
  lastSurprisePct: number | null;
  lastEpsActual: number | null;
  lastEpsEstimate: number | null;
  news: PulseHeadline[];
};

function toDateKey(d: Date): string {
  return dateKeyInTz(d);
}

function daysSince(date: Date): number {
  const today = new Date();
  const ms = today.getTime() - date.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

async function fetchTickerNewsUncached(
  ticker: string,
  count = 5
): Promise<PulseHeadline[]> {
  try {
    const yf = await getYahoo();
    const result = await yf.search(ticker, { newsCount: count });
    const items = result.news ?? [];
    return items.slice(0, count).map((n) => ({
      title: String(n.title ?? "").trim(),
      publisher: String(n.publisher ?? "News").trim(),
      link: String(n.link ?? "").trim(),
      publishedAt:
        n.providerPublishTime instanceof Date
          ? n.providerPublishTime.toISOString()
          : typeof n.providerPublishTime === "string"
            ? n.providerPublishTime
            : new Date().toISOString(),
    }));
  } catch (err) {
    console.error(`News fetch failed for ${ticker}`, err);
    return [];
  }
}

async function fetchTickerPulseContextUncached(
  ticker: string
): Promise<TickerPulseContext> {
  const base: TickerPulseContext = {
    ticker: ticker.toUpperCase(),
    sector: sectorForTicker(ticker),
    lastEarningsDate: null,
    daysSinceLastEarnings: null,
    nextEarningsDate: null,
    daysUntilNextEarnings: null,
    lastSurprisePct: null,
    lastEpsActual: null,
    lastEpsEstimate: null,
    news: [],
  };

  const [summaryResult, news] = await Promise.all([
    (async () => {
      try {
        const yf = await getYahoo();
        return await yf.quoteSummary(ticker, {
          modules: ["earningsHistory", "calendarEvents"],
        });
      } catch (err) {
        console.error(`Pulse context failed for ${ticker}`, err);
        return null;
      }
    })(),
    fetchTickerNewsUncached(ticker),
  ]);

  base.news = news;

  if (!summaryResult) return base;

  try {
    const summary = summaryResult;

    const history = summary.earningsHistory?.history ?? [];
    const latest = history[0];
    if (latest?.period) {
      const d = new Date(latest.period);
      if (!Number.isNaN(d.getTime())) {
        base.lastEarningsDate = toDateKey(d);
        base.daysSinceLastEarnings = daysSince(d);
      }
      if (typeof latest.surprisePercent === "number") {
        base.lastSurprisePct = latest.surprisePercent;
      }
      const epsActual =
        typeof latest.epsActual === "number"
          ? latest.epsActual
          : typeof latest.epsActual === "object" &&
              latest.epsActual &&
              "raw" in latest.epsActual
            ? (latest.epsActual as { raw?: number }).raw
            : null;
      const epsEstimate =
        typeof latest.epsEstimate === "number"
          ? latest.epsEstimate
          : typeof latest.epsEstimate === "object" &&
              latest.epsEstimate &&
              "raw" in latest.epsEstimate
            ? (latest.epsEstimate as { raw?: number }).raw
            : null;
      if (typeof epsActual === "number") base.lastEpsActual = epsActual;
      if (typeof epsEstimate === "number") base.lastEpsEstimate = epsEstimate;
    }

    const nextRaw =
      summary.calendarEvents?.earnings?.earningsDate?.[0] ??
      summary.calendarEvents?.earnings?.earningsDate?.[1];
    if (nextRaw) {
      const d = nextRaw instanceof Date ? nextRaw : new Date(nextRaw);
      if (!Number.isNaN(d.getTime())) {
        base.nextEarningsDate = toDateKey(d);
        base.daysUntilNextEarnings = daysUntilInTz(d);
      }
    }
  } catch (err) {
    console.error(`Pulse earnings parse failed for ${ticker}`, err);
  }

  return base;
}

const fetchTickerPulseContextCached = unstable_cache(
  async (ticker: string) => fetchTickerPulseContextUncached(ticker),
  ["pulse-ticker-context-v1"],
  { revalidate: 60 * 60 }
);

export async function fetchTickerNews(
  ticker: string,
  count = 5
): Promise<PulseHeadline[]> {
  const context = await fetchTickerPulseContext(ticker);
  return context.news.slice(0, count);
}

export async function fetchTickerPulseContext(
  ticker: string,
  opts?: { force?: boolean }
): Promise<TickerPulseContext> {
  const key = ticker.trim().toUpperCase();
  if (!key) {
    return fetchTickerPulseContextUncached(key);
  }
  if (opts?.force) {
    return fetchTickerPulseContextUncached(key);
  }
  return fetchTickerPulseContextCached(key);
}

export async function fetchPulseContexts(
  tickers: string[],
  opts?: { force?: boolean }
): Promise<Record<string, TickerPulseContext>> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const entries = await Promise.all(
    unique.map(
      async (ticker) =>
        [ticker, await fetchTickerPulseContext(ticker, opts)] as const
    )
  );
  return Object.fromEntries(entries);
}
