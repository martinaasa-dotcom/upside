import { dateKeyInTz, daysUntilInTz } from "@/lib/timezone";
import { sectorForTicker } from "@/lib/thesis-pulse";

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
};

function toDateKey(d: Date): string {
  return dateKeyInTz(d);
}

function daysSince(date: Date): number {
  const today = new Date();
  const ms = today.getTime() - date.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export async function fetchTickerPulseContext(
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
  };

  try {
    const yf = await getYahoo();
    const summary = await yf.quoteSummary(ticker, {
      modules: ["earningsHistory", "calendarEvents"],
    });

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
    console.error(`Pulse context failed for ${ticker}`, err);
  }

  return base;
}

export async function fetchPulseContexts(
  tickers: string[]
): Promise<Record<string, TickerPulseContext>> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const entries = await Promise.all(
    unique.map(async (ticker) => [ticker, await fetchTickerPulseContext(ticker)] as const)
  );
  return Object.fromEntries(entries);
}
