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
