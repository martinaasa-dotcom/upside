import { nextStrikeFromTarget, resolveStockTarget } from "@/lib/market/resistance";
import { roundMoney, safeDiv } from "@/lib/money";
import type {
  CoveredCallRow,
  EnrichedHolding,
  Holding,
  OptionCandidate,
  Portfolio,
  PortfolioSnapshot,
  Quote,
} from "./types";

export function enrichHoldings(
  holdings: Holding[],
  quotes: Record<string, Quote>,
  cashBalance: number
): EnrichedHolding[] {
  const withValues = holdings.map((h) => {
    const quote = quotes[h.ticker] ?? null;
    const price = quote?.price ?? h.buy_price;
    const buyValue = roundMoney(h.shares * h.buy_price);
    const currentValue = roundMoney(h.shares * price);
    const roiDollar = roundMoney(currentValue - buyValue);
    const roiPct = safeDiv(price - h.buy_price, h.buy_price);
    return {
      ...h,
      quote,
      buyValue,
      currentValue,
      roiPct,
      roiDollar,
      pctOfTotal: 0,
    };
  });

  const equityTotal = withValues.reduce((sum, h) => sum + h.currentValue, 0);
  const total = equityTotal + cashBalance;

  return withValues.map((h) => ({
    ...h,
    pctOfTotal: safeDiv(h.currentValue, total),
  }));
}

/** Always 1 contract per 100 shares */
export function contractsFromShares(shares: number): number {
  return Math.max(0, Math.floor(shares / 100));
}

export function buildCoveredCallRows(
  holdings: Holding[],
  quotes: Record<string, Quote>,
  optionsByTicker: Record<string, OptionCandidate | null>
): CoveredCallRow[] {
  return holdings.map((holding) => {
    const quote = quotes[holding.ticker];
    const spot = quote?.price ?? holding.buy_price;
    const totalValue = holding.shares * spot;
    const option = optionsByTicker[holding.ticker] ?? null;
    const contracts = contractsFromShares(holding.shares);

    const history = quote?.sparkline?.length
      ? quote.sparkline
      : [spot * 0.92, spot * 0.97, spot, spot * 1.05, spot * 1.1];

    // Stock target = manual override, else next resistance above spot
    const modeled = resolveStockTarget(spot, history);
    const stockTarget =
      holding.stock_target_override != null && holding.stock_target_override > 0
        ? holding.stock_target_override
        : modeled;

    // Next strike = Call % away from stock target
    const nextStrike =
      stockTarget > 0
        ? nextStrikeFromTarget(stockTarget, holding.target_call_pct)
        : null;

    // Distance = spot → stock target (not the same as Call %)
    const targetDistance =
      spot > 0 && stockTarget > 0 ? (stockTarget - spot) / spot : null;

    const premium =
      option && contracts > 0 ? option.mid * 100 * contracts : null;

    return {
      holding,
      spot,
      totalValue,
      yield2w: option?.yield2w ?? null,
      premium,
      targetCall: holding.target_call_pct,
      stockTarget: stockTarget || null,
      targetDistance,
      nextStrike,
      expiration: option?.expiration ?? null,
      contracts,
      option,
    };
  });
}

export function buildSnapshot(
  portfolio: Portfolio,
  holdings: Holding[],
  quotes: Record<string, Quote>,
  optionsByTicker: Record<string, OptionCandidate | null>
): PortfolioSnapshot {
  // Default sort: largest % of total first
  const enriched = enrichHoldings(holdings, quotes, portfolio.cash_balance).sort(
    (a, b) => b.pctOfTotal - a.pctOfTotal
  );

  // CC table follows the same order
  const holdingsInViewOrder = enriched.map(
    (e) => holdings.find((h) => h.id === e.id)!
  );
  const coveredCallRows = buildCoveredCallRows(
    holdingsInViewOrder,
    quotes,
    optionsByTicker
  );

  const buyValue = roundMoney(
    enriched.reduce((s, h) => s + h.buyValue, 0)
  );
  const currentValue = roundMoney(
    enriched.reduce((s, h) => s + h.currentValue, 0) + portfolio.cash_balance
  );
  // Cost-weighted portfolio return: Σ(P&L) / Σ(cost) — not a simple average of row ROI%
  const roiDollar = roundMoney(
    enriched.reduce((s, h) => s + h.roiDollar, 0)
  );
  const roiPct = safeDiv(roiDollar, buyValue);
  const premiumTotal = roundMoney(
    coveredCallRows.reduce((s, r) => s + (r.premium ?? 0), 0)
  );
  const yieldVals = coveredCallRows
    .map((r) => r.yield2w)
    .filter((v): v is number => v !== null);
  const yield2wAvg =
    yieldVals.length > 0
      ? yieldVals.reduce((a, b) => a + b, 0) / yieldVals.length
      : 0;

  return {
    portfolio,
    holdings: enriched,
    coveredCallRows,
    totals: {
      buyValue,
      currentValue,
      roiDollar,
      roiPct,
      yield2wAvg,
      premiumTotal,
      unrealizedProfits: roiDollar,
    },
  };
}

export const STRATEGY = {
  /**
   * Call % is volatility-scaled (not a flat safety default).
   * Soft floors/ceilings for proposals; AI must still pick per-ticker.
   */
  callPctSafeMin: 0.05,
  callPctSafeMax: 0.08,
  callPctMid: 0.14,
  callPctHighBeta: 0.2,
  callPctMax: 0.28,
  /** Soft starting Call % only when vol is unknown */
  defaultCallPct: 0.14,
  /** Ideal center of preferred tenor */
  targetDays: 17,
  /** Preferred covered-call window (~2–3 weeks) */
  minDaysPreferred: 14,
  maxDaysPreferred: 21,
  /** Absolute max when earnings forces a longer dated */
  maxDaysExtended: 45,
  /** Legacy scan window around targetDays */
  dayWindow: 4,
  targetYield: 0.05,
  minYield: 0.03,
  executionWindow: "16:45 – 18:00 EEST",
} as const;

/**
 * House Call % baselines by ticker (Martin-confirmed vol guidance).
 * Prefer these over a flat default; nudge for earnings / setup.
 */
export const CALL_PCT_BASELINES: Record<string, number> = {
  VST: 0.07, // lower-vol / utility-ish
  BMNR: 0.15,
  RKLB: 0.16,
  CRWV: 0.18,
  NBIS: 0.22, // high-beta
};

/** Optional stock-target baselines paired with the Call % set above */
export const STOCK_TARGET_BASELINES: Record<string, number> = {
  CRWV: 90,
  NBIS: 205,
  BMNR: 19.5,
  VST: 145,
  RKLB: 77,
};

export function callPctBaseline(ticker: string): number | null {
  const pct = CALL_PCT_BASELINES[ticker.toUpperCase()];
  return pct ?? null;
}

export function formatCallPctBaselines(): string {
  return Object.entries(CALL_PCT_BASELINES)
    .sort((a, b) => a[1] - b[1])
    .map(([t, p]) => `${t} ~${Math.round(p * 100)}%`)
    .join(", ");
}
