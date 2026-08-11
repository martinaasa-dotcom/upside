import { enrichHoldings } from "@/lib/calculations";
import { buildDailyFunFacts } from "@/lib/fun-facts";
import type { Holding, Portfolio, Quote } from "@/lib/types";

export const OVERVIEW_TAB_ID = "__overview__";
export const COMPOUND_TAB_ID = "__compound__";
export const LAB_TAB_ID = "__lab__";
export const PULSE_TAB_ID = "__pulse__";

export type SheetScore = {
  portfolio: Portfolio;
  buyValue: number;
  equityValue: number;
  totalValue: number;
  roiDollar: number;
  roiPct: number;
  todayDollar: number;
  todayPct: number | null;
  holdingCount: number;
};

/** One row per ticker, rolled up across every portfolio that owns it. */
export type TickerScore = {
  ticker: string;
  portfolios: string[];
  portfolioIds: string[];
  shares: number;
  buyValue: number;
  currentValue: number;
  roiDollar: number;
  roiPct: number;
  todayDollar: number;
  todayPct: number | null;
  price: number;
  sparkline: number[];
};

export type OverviewModel = {
  sheets: SheetScore[];
  tickers: TickerScore[];
  winners: TickerScore[];
  losers: TickerScore[];
  todayWinners: TickerScore[];
  todayLosers: TickerScore[];
  topHoldings: TickerScore[];
  funFacts: string[];
  totals: {
    buyValue: number;
    equityValue: number;
    cash: number;
    totalValue: number;
    roiDollar: number;
    roiPct: number;
    todayDollar: number;
    todayPct: number | null;
    sheetCount: number;
    positionCount: number;
    uniqueTickers: number;
  };
};

function todayDollarFor(
  currentValue: number,
  changePercent: number | null | undefined
): { dollar: number; pct: number | null } {
  if (changePercent === null || changePercent === undefined || Number.isNaN(changePercent)) {
    return { dollar: 0, pct: null };
  }
  return { dollar: currentValue * changePercent, pct: changePercent };
}

export function buildOverview(
  portfolios: Portfolio[],
  holdings: Holding[],
  quotes: Record<string, Quote>
): OverviewModel {
  const sheets: SheetScore[] = portfolios.map((portfolio) => {
    const rows = holdings.filter((h) => h.portfolio_id === portfolio.id);
    const enriched = enrichHoldings(rows, quotes, portfolio.cash_balance);
    const buyValue = enriched.reduce((s, h) => s + h.buyValue, 0);
    const equityValue = enriched.reduce((s, h) => s + h.currentValue, 0);
    const roiDollar = enriched.reduce((s, h) => s + h.roiDollar, 0);
    let todayDollar = 0;
    let todayWeighted = 0;
    let todayWeight = 0;
    for (const h of enriched) {
      const t = todayDollarFor(h.currentValue, h.quote?.changePercent);
      todayDollar += t.dollar;
      if (t.pct !== null) {
        todayWeighted += t.pct * h.currentValue;
        todayWeight += h.currentValue;
      }
    }
    return {
      portfolio,
      buyValue,
      equityValue,
      totalValue: equityValue + portfolio.cash_balance,
      roiDollar,
      roiPct: buyValue > 0 ? roiDollar / buyValue : 0,
      todayDollar,
      todayPct: todayWeight > 0 ? todayWeighted / todayWeight : null,
      holdingCount: enriched.length,
    };
  });

  const byTicker = new Map<
    string,
    {
      portfolios: Set<string>;
      portfolioIds: Set<string>;
      shares: number;
      buyValue: number;
      currentValue: number;
      roiDollar: number;
      todayDollar: number;
      quote: Quote | null;
    }
  >();

  for (const portfolio of portfolios) {
    const rows = holdings.filter((h) => h.portfolio_id === portfolio.id);
    const enriched = enrichHoldings(rows, quotes, portfolio.cash_balance);
    for (const h of enriched) {
      const key = h.ticker.toUpperCase();
      const existing = byTicker.get(key) ?? {
        portfolios: new Set<string>(),
        portfolioIds: new Set<string>(),
        shares: 0,
        buyValue: 0,
        currentValue: 0,
        roiDollar: 0,
        todayDollar: 0,
        quote: h.quote,
      };
      existing.portfolios.add(portfolio.name);
      existing.portfolioIds.add(portfolio.id);
      existing.shares += h.shares;
      existing.buyValue += h.buyValue;
      existing.currentValue += h.currentValue;
      existing.roiDollar += h.roiDollar;
      existing.todayDollar += todayDollarFor(
        h.currentValue,
        h.quote?.changePercent
      ).dollar;
      if (h.quote) existing.quote = h.quote;
      byTicker.set(key, existing);
    }
  }

  const tickers: TickerScore[] = [...byTicker.entries()].map(([ticker, row]) => {
    const todayPct = row.quote?.changePercent ?? null;
    return {
      ticker,
      portfolios: [...row.portfolios].sort(),
      portfolioIds: [...row.portfolioIds],
      shares: row.shares,
      buyValue: row.buyValue,
      currentValue: row.currentValue,
      roiDollar: row.roiDollar,
      roiPct: row.buyValue > 0 ? row.roiDollar / row.buyValue : 0,
      todayDollar: row.todayDollar,
      todayPct,
      price: row.quote?.price ?? (row.shares > 0 ? row.currentValue / row.shares : 0),
      sparkline: row.quote?.sparkline ?? [],
    };
  });

  const byRoi = [...tickers].sort((a, b) => b.roiPct - a.roiPct);
  const byToday = [...tickers]
    .filter((t) => t.todayPct !== null)
    .sort((a, b) => (b.todayPct ?? 0) - (a.todayPct ?? 0));
  const byValue = [...tickers].sort((a, b) => b.currentValue - a.currentValue);

  const buyValue = sheets.reduce((s, x) => s + x.buyValue, 0);
  const equityValue = sheets.reduce((s, x) => s + x.equityValue, 0);
  const cash = portfolios.reduce((s, p) => s + p.cash_balance, 0);
  const roiDollar = sheets.reduce((s, x) => s + x.roiDollar, 0);
  const todayDollar = sheets.reduce((s, x) => s + x.todayDollar, 0);
  let todayWeighted = 0;
  let todayWeight = 0;
  for (const t of tickers) {
    if (t.todayPct !== null) {
      todayWeighted += t.todayPct * t.currentValue;
      todayWeight += t.currentValue;
    }
  }

  const totals = {
    buyValue,
    equityValue,
    cash,
    totalValue: equityValue + cash,
    roiDollar,
    roiPct: buyValue > 0 ? roiDollar / buyValue : 0,
    todayDollar,
    todayPct: todayWeight > 0 ? todayWeighted / todayWeight : null,
    sheetCount: portfolios.length,
    positionCount: holdings.length,
    uniqueTickers: tickers.length,
  };

  const sortedSheets = [...sheets].sort((a, b) => b.totalValue - a.totalValue);

  return {
    sheets: sortedSheets,
    tickers: byValue,
    winners: byRoi.filter((t) => t.roiPct > 0).slice(0, 5),
    losers: byRoi.filter((t) => t.roiPct < 0).slice(-5).reverse(),
    todayWinners: byToday.filter((t) => (t.todayPct ?? 0) > 0).slice(0, 5),
    todayLosers: byToday.filter((t) => (t.todayPct ?? 0) < 0).slice(-5).reverse(),
    topHoldings: byValue.slice(0, 10),
    funFacts: buildDailyFunFacts(sortedSheets, tickers, totals),
    totals,
  };
}
