import type { Holding, Quote } from "@/lib/types";

/** EOY columns shown after Current — next 5 years from this year. */
export const FORECAST_YEARS = [2026, 2027, 2028, 2029, 2030] as const;
export type ForecastYear = (typeof FORECAST_YEARS)[number];

/**
 * House EOY price targets by ticker (USD).
 * Edit when Martin pastes an updated milestones / forecast sheet.
 * Tickers without a row fall back to the live quote (flat).
 */
export const EOY_PRICE_TARGETS: Record<
  string,
  Partial<Record<ForecastYear, number>>
> = {
  NBIS: { 2026: 250, 2027: 340, 2028: 300, 2029: 450, 2030: 580 },
  CRWV: { 2026: 110, 2027: 180, 2028: 160, 2029: 320, 2030: 480 },
  RKLB: { 2026: 85, 2027: 120, 2028: 150, 2029: 200, 2030: 260 },
  BMNR: { 2026: 28, 2027: 45, 2028: 22, 2029: 55, 2030: 80 },
  VST: { 2026: 160, 2027: 175, 2028: 190, 2029: 210, 2030: 230 },
  SOFI: { 2026: 25, 2027: 35, 2028: 45, 2029: 60, 2030: 75 },
  HOOD: { 2026: 80, 2027: 110, 2028: 70, 2029: 140, 2030: 180 },
  PLTR: { 2026: 140, 2027: 160, 2028: 150, 2029: 200, 2030: 250 },
  NOW: { 2026: 900, 2027: 1000, 2028: 1100, 2029: 1200, 2030: 1400 },
  NVDA: { 2026: 200, 2027: 240, 2028: 220, 2029: 300, 2030: 380 },
  AVGO: { 2026: 400, 2027: 450, 2028: 480, 2029: 550, 2030: 650 },
  RDDT: { 2026: 180, 2027: 220, 2028: 200, 2029: 280, 2030: 350 },
};

export type ForecastSuggestion = {
  year: ForecastYear | 2031;
  theme: string;
  add: string;
  trim: string;
};

/** Year-by-year trim / add playbook from the milestones forecast sheet. */
export const FORECAST_SUGGESTIONS: ForecastSuggestion[] = [
  {
    year: 2026,
    theme: "The Liquidity Launchpad",
    add: "BMNR and HOOD",
    trim: "NOW / PLTR, or minor chunks from NBIS",
  },
  {
    year: 2027,
    theme: "The Cyclical Top (Take-Profit Window)",
    add: "NBIS and CRWV",
    trim: "BMNR and HOOD",
  },
  {
    year: 2028,
    theme: "The Crypto Winter & Power Rotation",
    add: "SOFI and RKLB",
    trim: "BMNR",
  },
  {
    year: 2029,
    theme: "The Trough Accumulation Window",
    add: "BMNR and HOOD",
    trim: "NBIS and CRWV",
  },
  {
    year: 2030,
    theme: "The Scale & Expansion Phase",
    add: "SOFI and PLTR",
    trim: "NBIS and CRWV",
  },
];

export type ForecastRow = {
  ticker: string;
  shares: number;
  currentPrice: number;
  currentValue: number;
  /** EOY mark price per year (target or flat live price) */
  eoyPrices: Record<ForecastYear, number>;
  eoyValues: Record<ForecastYear, number>;
  /** (final EOY value − current) / current */
  gainPct: number | null;
  hasTargets: boolean;
};

export type ForecastModel = {
  years: readonly ForecastYear[];
  rows: ForecastRow[];
  currentTotal: number;
  eoyTotals: Record<ForecastYear, number>;
  /** Portfolio gain to last forecast year */
  gainPct: number | null;
  suggestions: ForecastSuggestion[];
};

function priceForYear(
  ticker: string,
  year: ForecastYear,
  spot: number
): { price: number; fromTarget: boolean } {
  const target = EOY_PRICE_TARGETS[ticker.toUpperCase()]?.[year];
  if (typeof target === "number" && target > 0) {
    return { price: target, fromTarget: true };
  }
  return { price: spot, fromTarget: false };
}

export function buildForecast(
  holdings: Holding[],
  quotes: Record<string, Quote>,
  cashBalance: number
): ForecastModel {
  const rows: ForecastRow[] = holdings
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((h) => {
      const spot = quotes[h.ticker]?.price ?? h.buy_price;
      const eoyPrices = {} as Record<ForecastYear, number>;
      const eoyValues = {} as Record<ForecastYear, number>;
      let hasTargets = false;
      for (const year of FORECAST_YEARS) {
        const { price, fromTarget } = priceForYear(h.ticker, year, spot);
        if (fromTarget) hasTargets = true;
        eoyPrices[year] = price;
        eoyValues[year] = h.shares * price;
      }
      const currentValue = h.shares * spot;
      const lastYear = FORECAST_YEARS[FORECAST_YEARS.length - 1];
      const lastValue = eoyValues[lastYear];
      const gainPct =
        currentValue !== 0 ? (lastValue - currentValue) / currentValue : null;
      return {
        ticker: h.ticker,
        shares: h.shares,
        currentPrice: spot,
        currentValue,
        eoyPrices,
        eoyValues,
        gainPct,
        hasTargets,
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
    suggestions: FORECAST_SUGGESTIONS.filter((s) =>
      FORECAST_YEARS.includes(s.year as ForecastYear)
    ),
  };
}
