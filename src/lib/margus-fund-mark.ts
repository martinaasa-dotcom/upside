/**
 * Shared live mark for the Upside Portfolio (cash + open holdings at
 * quote, else cost basis). Overview teaser and Fund page must use this
 * same formula so they never disagree.
 */

export type FundMarkHolding = {
  ticker: string;
  shares: number;
  cost_basis: number;
  status?: string;
};

export function liveFundTotalValue(input: {
  cash: number;
  holdings: FundMarkHolding[];
  quotes: Record<string, { price?: number } | undefined>;
}): number {
  const open = input.holdings.filter(
    (h) => !h.status || h.status === "open"
  );
  const holdingsValue = open.reduce(
    (sum, h) => sum + h.shares * (input.quotes[h.ticker]?.price ?? h.cost_basis),
    0
  );
  return input.cash + holdingsValue;
}

/** Live NAV minus the last daily snapshot. Same math on Overview and Fund. */
export function liveFundTodayMove(input: {
  liveTotal: number;
  lastReportValue: number | null | undefined;
}): { todayDollar: number; todayPct: number | null } {
  const prev = input.lastReportValue;
  if (prev == null || !Number.isFinite(prev)) {
    return { todayDollar: 0, todayPct: null };
  }
  const todayDollar = input.liveTotal - prev;
  return {
    todayDollar,
    todayPct: prev > 0 ? todayDollar / prev : null,
  };
}

export function fundDayNumber(inceptionDate: string | null | undefined): number {
  if (!inceptionDate) return 1;
  const start = new Date(`${inceptionDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(start)) return 1;
  return Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1);
}
