/**
 * Shared live mark for the Upside Portfolio (cash + open holdings at
 * quote, else cost basis). Overview teaser and Fund page must use this
 * same formula so they never disagree.
 */

import { finiteNumber, roundMoney, safeDiv, sumMoney } from "@/lib/money";

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
  const holdingsValue = sumMoney(
    open.map((h) => {
      const quoted = input.quotes[h.ticker]?.price;
      const px =
        typeof quoted === "number" && Number.isFinite(quoted)
          ? quoted
          : finiteNumber(h.cost_basis);
      return finiteNumber(h.shares) * px;
    })
  );
  return roundMoney(finiteNumber(input.cash) + holdingsValue);
}

/** Live NAV minus the last daily snapshot. Same math on Overview and Fund. */
export function liveFundTodayMove(input: {
  liveTotal: number;
  lastReportValue: number | null | undefined;
}): { todayDollar: number; todayPct: number | null } {
  const prev = input.lastReportValue;
  const live = finiteNumber(input.liveTotal);
  if (prev == null || !Number.isFinite(prev)) {
    return { todayDollar: 0, todayPct: null };
  }
  const todayDollar = roundMoney(live - prev);
  return {
    todayDollar,
    todayPct: prev > 0 ? safeDiv(todayDollar, prev) : null,
  };
}

export function fundDayNumber(inceptionDate: string | null | undefined): number {
  if (!inceptionDate) return 1;
  const start = new Date(`${inceptionDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(start)) return 1;
  return Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1);
}
