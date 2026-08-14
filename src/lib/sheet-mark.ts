import type { Quote } from "@/lib/types";

export type SheetMeta = {
  id: string;
  cash_balance: number;
};

export type SheetHolding = {
  portfolio_id: string;
  ticker: string;
  shares: number;
  buy_price: number;
};

/** Previous weekday. US holidays are not listed; one extra session is cheap. */
export function priorNySessionKey(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < 5; i++) {
    dt.setUTCDate(dt.getUTCDate() - 1);
    const wd = dt.getUTCDay();
    if (wd !== 0 && wd !== 6) return dt.toISOString().slice(0, 10);
  }
  return isoDate;
}

export function closeOnDate(quote: Quote | undefined, dateKey: string): number | null {
  if (!quote) return null;
  const bars = quote.dailyCloses ?? [];
  const exact = bars.find((b) => b.date === dateKey);
  if (exact && exact.close > 0) return exact.close;
  const prior = [...bars].filter((b) => b.date <= dateKey && b.close > 0).at(-1);
  if (prior) return prior.close;
  return null;
}

function portfolioValueAt(
  meta: SheetMeta,
  holdings: SheetHolding[],
  quotes: Record<string, Quote>,
  priceOf: (q: Quote | undefined, fallback: number) => number
): number {
  const equity = holdings
    .filter((h) => h.portfolio_id === meta.id)
    .reduce(
      (sum, h) => sum + h.shares * priceOf(quotes[h.ticker], h.buy_price),
      0
    );
  return meta.cash_balance + equity;
}

export function quotesCoverDate(
  quotes: Record<string, Quote>,
  holdings: SheetHolding[],
  portfolioId: string,
  dateKey: string
): boolean {
  const rows = holdings.filter((h) => h.portfolio_id === portfolioId);
  if (rows.length === 0) return false;
  const hit = rows.filter(
    (h) => closeOnDate(quotes[h.ticker], dateKey) != null
  ).length;
  return hit * 2 >= rows.length;
}

export function portfolioLiveValue(
  meta: SheetMeta,
  holdings: SheetHolding[],
  quotes: Record<string, Quote>
): number {
  return portfolioValueAt(
    meta,
    holdings,
    quotes,
    (q, fallback) => q?.price ?? fallback
  );
}

export function portfolioCostValue(
  meta: SheetMeta,
  holdings: SheetHolding[]
): number {
  const cost = holdings
    .filter((h) => h.portfolio_id === meta.id)
    .reduce((sum, h) => sum + h.shares * h.buy_price, 0);
  return meta.cash_balance + cost;
}

/** Mark-to-market on a past NY session, using dated daily bars when we have them. */
export function portfolioValueOnDate(
  meta: SheetMeta,
  holdings: SheetHolding[],
  quotes: Record<string, Quote>,
  dateKey: string
): number {
  return portfolioValueAt(meta, holdings, quotes, (q, fallback) => {
    const asOf = closeOnDate(q, dateKey);
    if (asOf != null) return asOf;
    return q?.previousClose ?? fallback;
  });
}

/**
 * Fractional return vs a pin date, aligned to an existing chart's labels
 * (report dates plus a trailing "Live"). Dates before the pin stay at 0
 * so the line sits on the same axis without pretending you were racing
 * from day one.
 */
export function sheetReturnPathSince({
  labels,
  baselineDate,
  baselineValue,
  liveValue,
  meta,
  holdings,
  quotes,
}: {
  labels: string[];
  baselineDate: string;
  baselineValue: number;
  liveValue: number | null;
  meta: SheetMeta;
  holdings: SheetHolding[];
  quotes: Record<string, Quote>;
}): number[] {
  let last = 0;
  return labels.map((label) => {
    if (label !== "Live" && label < baselineDate) {
      last = 0;
      return 0;
    }
    if (!(baselineValue > 0)) return last;
    if (label === "Live") {
      if (liveValue == null) return last;
      last = (liveValue - baselineValue) / baselineValue;
      return last;
    }
    if (!quotesCoverDate(quotes, holdings, meta.id, label)) return last;
    const v = portfolioValueOnDate(meta, holdings, quotes, label);
    last = (v - baselineValue) / baselineValue;
    return last;
  });
}
