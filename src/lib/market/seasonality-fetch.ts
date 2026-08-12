import type { DailyBar } from "@/lib/market/seasonality";
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

export async function fetchSeasonalityBars(ticker: string): Promise<{
  daily: DailyBar[];
}> {
  const symbol = normalizeYahooTicker(ticker);
  const yf = await getYahoo();

  const dailyChart = await yf.chart(symbol, {
    period1: new Date("1993-01-01"),
    period2: new Date(),
    interval: "1d",
  });

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

  return { daily };
}
