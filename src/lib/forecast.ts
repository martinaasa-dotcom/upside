import type { Holding, Quote } from "@/lib/types";
import type { PortfolioEoyOverrides } from "@/lib/forecast-overrides";

/** EOY columns shown after Current — next 5 years from this year. */
export const FORECAST_YEARS = [2026, 2027, 2028, 2029, 2030] as const;
export type ForecastYear = (typeof FORECAST_YEARS)[number];

export type ForecastRow = {
  ticker: string;
  shares: number;
  currentPrice: number;
  currentValue: number;
  /** EOY mark price per year (Margus/manual override, else temporary spot) */
  eoyPrices: Record<ForecastYear, number>;
  eoyValues: Record<ForecastYear, number>;
  /** True when that year has a Margus/manual override (not placeholder spot) */
  targetedYears: Record<ForecastYear, boolean>;
  /** (final EOY stock price − current SP) / current SP */
  gainPct: number | null;
  /** True when every forecast year has an override */
  hasTargets: boolean;
};

export type ForecastModel = {
  years: readonly ForecastYear[];
  rows: ForecastRow[];
  currentTotal: number;
  eoyTotals: Record<ForecastYear, number>;
  /** Portfolio gain to last forecast year */
  gainPct: number | null;
};

function normalizeTickerKey(ticker: string) {
  return ticker.toUpperCase();
}

/**
 * Resolve EOY SP from Margus/manual overrides only.
 * Never use hardcoded house baselines — missing years stay at spot until the model fills them.
 */
function priceForYear(
  ticker: string,
  year: ForecastYear,
  spot: number,
  overrides?: PortfolioEoyOverrides
): { price: number; targeted: boolean } {
  const key = normalizeTickerKey(ticker);
  const override = overrides?.[key]?.[year];
  if (typeof override === "number" && override > 0) {
    return { price: override, targeted: true };
  }
  return { price: spot, targeted: false };
}

/** True when every holding has a positive override for every forecast year. */
export function isForecastFullyCovered(
  tickers: string[],
  overrides?: PortfolioEoyOverrides
): boolean {
  if (!tickers.length) return true;
  for (const ticker of tickers) {
    const key = normalizeTickerKey(ticker);
    const row = overrides?.[key];
    if (!row) return false;
    for (const year of FORECAST_YEARS) {
      const p = row[year];
      if (!(typeof p === "number" && p > 0)) return false;
    }
  }
  return true;
}

export function buildForecast(
  holdings: Holding[],
  quotes: Record<string, Quote>,
  cashBalance: number,
  overrides?: PortfolioEoyOverrides
): ForecastModel {
  const rows: ForecastRow[] = holdings
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((h) => {
      const spot = quotes[h.ticker]?.price ?? h.buy_price;
      const eoyPrices = {} as Record<ForecastYear, number>;
      const eoyValues = {} as Record<ForecastYear, number>;
      const targetedYears = {} as Record<ForecastYear, boolean>;
      let targetedCount = 0;
      for (const year of FORECAST_YEARS) {
        const { price, targeted } = priceForYear(
          h.ticker,
          year,
          spot,
          overrides
        );
        if (targeted) targetedCount += 1;
        eoyPrices[year] = price;
        eoyValues[year] = h.shares * price;
        targetedYears[year] = targeted;
      }
      const currentValue = h.shares * spot;
      const lastYear = FORECAST_YEARS[FORECAST_YEARS.length - 1];
      const lastPrice = eoyPrices[lastYear];
      const gainPct = spot !== 0 ? (lastPrice - spot) / spot : null;
      return {
        ticker: h.ticker,
        shares: h.shares,
        currentPrice: spot,
        currentValue,
        eoyPrices,
        eoyValues,
        targetedYears,
        gainPct,
        hasTargets: targetedCount === FORECAST_YEARS.length,
      };
    });

  const equityCurrent = rows.reduce((s, r) => s + r.currentValue, 0);
  const currentTotal = equityCurrent + cashBalance;
  const eoyTotals = {} as Record<ForecastYear, number>;
  for (const year of FORECAST_YEARS) {
    eoyTotals[year] =
      rows.reduce((s, r) => s + r.eoyValues[year], 0) + cashBalance;
  }
  const lastYear = FORECAST_YEARS[FORECAST_YEARS.length - 1];
  const gainPct =
    currentTotal !== 0
      ? (eoyTotals[lastYear] - currentTotal) / currentTotal
      : null;

  return {
    years: FORECAST_YEARS,
    rows,
    currentTotal,
    eoyTotals,
    gainPct,
  };
}
