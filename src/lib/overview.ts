import { enrichHoldings } from "@/lib/calculations";
import type {
  EnrichedHolding,
  Holding,
  Portfolio,
  Quote,
} from "@/lib/types";

export const OVERVIEW_TAB_ID = "__overview__";

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

export type PositionScore = EnrichedHolding & {
  portfolioName: string;
  portfolioId: string;
  todayDollar: number;
  todayPct: number | null;
};

export type OverviewModel = {
  sheets: SheetScore[];
  positions: PositionScore[];
  winners: PositionScore[];
  losers: PositionScore[];
  todayWinners: PositionScore[];
  todayLosers: PositionScore[];
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
  };
};

function todayPnL(h: EnrichedHolding): { dollar: number; pct: number | null } {
  const pct = h.quote?.changePercent ?? null;
  if (pct === null || Number.isNaN(pct)) {
    return { dollar: 0, pct: null };
  }
  // Quote.changePercent is a fraction (0.015 = +1.5%)
  return {
    dollar: h.currentValue * pct,
    pct,
  };
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
      const t = todayPnL(h);
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

  const positions: PositionScore[] = [];
  for (const portfolio of portfolios) {
    const rows = holdings.filter((h) => h.portfolio_id === portfolio.id);
    const enriched = enrichHoldings(rows, quotes, portfolio.cash_balance);
    for (const h of enriched) {
      const t = todayPnL(h);
      positions.push({
        ...h,
        portfolioName: portfolio.name,
        portfolioId: portfolio.id,
        todayDollar: t.dollar,
        todayPct: t.pct,
      });
    }
  }

  const byRoi = [...positions].sort((a, b) => b.roiPct - a.roiPct);
  const byToday = [...positions]
    .filter((p) => p.todayPct !== null)
    .sort((a, b) => (b.todayPct ?? 0) - (a.todayPct ?? 0));

  const buyValue = sheets.reduce((s, x) => s + x.buyValue, 0);
  const equityValue = sheets.reduce((s, x) => s + x.equityValue, 0);
  const cash = portfolios.reduce((s, p) => s + p.cash_balance, 0);
  const roiDollar = sheets.reduce((s, x) => s + x.roiDollar, 0);
  const todayDollar = sheets.reduce((s, x) => s + x.todayDollar, 0);
  let todayWeighted = 0;
  let todayWeight = 0;
  for (const p of positions) {
    if (p.todayPct !== null) {
      todayWeighted += p.todayPct * p.currentValue;
      todayWeight += p.currentValue;
    }
  }

  return {
    sheets: [...sheets].sort((a, b) => b.totalValue - a.totalValue),
    positions: [...positions].sort((a, b) => b.currentValue - a.currentValue),
    winners: byRoi.filter((p) => p.roiPct > 0).slice(0, 5),
    losers: byRoi.filter((p) => p.roiPct < 0).slice(-5).reverse(),
    todayWinners: byToday.filter((p) => (p.todayPct ?? 0) > 0).slice(0, 5),
    todayLosers: byToday.filter((p) => (p.todayPct ?? 0) < 0).slice(-5).reverse(),
    totals: {
      buyValue,
      equityValue,
      cash,
      totalValue: equityValue + cash,
      roiDollar,
      roiPct: buyValue > 0 ? roiDollar / buyValue : 0,
      todayDollar,
      todayPct: todayWeight > 0 ? todayWeighted / todayWeight : null,
      sheetCount: portfolios.length,
      positionCount: positions.length,
    },
  };
}
