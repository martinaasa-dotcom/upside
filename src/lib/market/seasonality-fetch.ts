import type { DailyBar, HourBar } from "@/lib/market/seasonality";
import { normalizeYahooTicker } from "@/lib/ticker";

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

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** US/Eastern hour for a UTC timestamp (Yahoo chart dates). */
function hourEt(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value;
  return h ? Number(h) : d.getUTCHours();
}

export async function fetchSeasonalityBars(ticker: string): Promise<{
  daily: DailyBar[];
  hourly: HourBar[];
}> {
  const symbol = normalizeYahooTicker(ticker);
  const yf = await getYahoo();

  const period1Daily = new Date("1993-01-01");
  const period2 = new Date();
  const period1Hourly = new Date(Date.now() - 730 * 24 * 3600 * 1000);

  const [dailyChart, hourlyChart] = await Promise.all([
    yf.chart(symbol, {
      period1: period1Daily,
      period2,
      interval: "1d",
    }),
    yf.chart(symbol, {
      period1: period1Hourly,
      period2,
      interval: "1h",
    }),
  ]);

  const daily: DailyBar[] = [];
  for (const row of dailyChart.quotes ?? []) {
    const rawDate = row.date as Date | string | undefined;
    let date: string | null = null;
    if (rawDate instanceof Date) {
      date = toIsoDate(rawDate);
    } else if (typeof rawDate === "string") {
      date = rawDate.slice(0, 10);
    }
    const open = num(row.open);
    const high = num(row.high);
    const low = num(row.low);
    const close = num(row.close);
    if (!date || open == null || high == null || low == null || close == null) {
      continue;
    }
    daily.push({ date, open, high, low, close });
  }

  const hourly: HourBar[] = [];
  for (const row of hourlyChart.quotes ?? []) {
    if (!(row.date instanceof Date)) continue;
    const open = num(row.open);
    const high = num(row.high);
    const low = num(row.low);
    const close = num(row.close);
    if (open == null || high == null || low == null || close == null) continue;
    hourly.push({
      date: toIsoDate(row.date),
      hourEt: hourEt(row.date),
      open,
      high,
      low,
      close,
    });
  }

  return { daily, hourly };
}
