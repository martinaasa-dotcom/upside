import { requireAuthUser } from "@/lib/supabase/server-auth";
import { normalizeYahooTicker } from "@/lib/ticker";
import {
  macd,
  relativeStrength,
  rsi,
  rsiDivergence,
  toWeekly,
  trendRegime,
  type Bar,
} from "@/lib/market/indicators";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

const BENCHMARK = "SPY";
/** Weekly indicators need years, not months: 40-week averages plus room
 * for two swings before them. Three years is the floor that makes the
 * long-trend read meaningful. */
const YEARS_BACK = 4;
/** Yahoo is a free tier and this fans out per ticker, so cap the work. */
const MAX_TICKERS = 14;

type TrendRow = {
  ticker: string;
  regime: string;
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
  lastClose: number | null;
};

async function weeklyCloses(ticker: string): Promise<number[] | null> {
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
        raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10);
      bars.push({ date, close });
    }
    if (bars.length < 60) return null;
    return toWeekly(bars).map((b) => b.close);
  } catch {
    // One bad ticker shouldn't sink the whole board.
    return null;
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as { tickers?: unknown };
  const requested = Array.isArray(body.tickers)
    ? body.tickers
        .filter((t): t is string => typeof t === "string" && !!t.trim())
        .map((t) => t.trim().toUpperCase())
    : [];

  const unique = [...new Set(requested)].slice(0, MAX_TICKERS);
  if (unique.length === 0) {
    return NextResponse.json({ rows: [], benchmark: null });
  }

  const symbols = [...new Set([...unique, BENCHMARK])];
  const settled = await Promise.all(
    symbols.map(async (t) => [t, await weeklyCloses(t)] as const)
  );
  const bySymbol = new Map(settled);
  const bench = bySymbol.get(BENCHMARK) ?? null;

  const rows: TrendRow[] = [];
  for (const ticker of unique) {
    const closes = bySymbol.get(ticker);
    if (!closes || closes.length < 30) continue;

    const rsiSeries = rsi(closes, 14);
    const m = macd(closes);
    const regime = trendRegime(closes);
    const div = rsiDivergence(closes, rsiSeries, { window: 3, maxBarsAgo: 8 });
    const hist = m.histogram.at(-1) ?? null;
    const histPrev = m.histogram.at(-4) ?? null;

    rows.push({
      ticker,
      regime: regime.regime,
      aboveLongMa: regime.aboveLong,
      rsi: rsiSeries.at(-1) ?? null,
      macdHistogram: hist,
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
      lastClose: closes.at(-1) ?? null,
    });
  }

  return NextResponse.json({
    rows,
    benchmark: BENCHMARK,
    asOf: new Date().toISOString(),
  });
}
