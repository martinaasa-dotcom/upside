import { createHash } from "node:crypto";
import type { BookSnapshotPayload } from "@/lib/book-snapshot";
import { finiteNumber, roundMoney, sumMoney } from "@/lib/money";

export type BookChecksum = {
  cashSum: number;
  holdingsCostSum: number;
  /** SUM(cash) + SUM(shares * buy price), rounded to the cent. */
  bookSum: number;
  portfolioCount: number;
  holdingCount: number;
  sha256: string;
};

type CashRow = { id: string; cash_balance: number };
type HoldingCostRow = {
  id: string;
  portfolio_id: string;
  ticker: string;
  shares: number;
  buy_price: number;
};

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

export function portfolioCashRows(portfolios: unknown[]): CashRow[] {
  const out: CashRow[] = [];
  for (const raw of portfolios) {
    const p = asRecord(raw);
    const id = String(p.id ?? "").trim();
    if (!id) continue;
    out.push({ id, cash_balance: roundMoney(finiteNumber(p.cash_balance)) });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

export function holdingCostRows(holdings: unknown[]): HoldingCostRow[] {
  const out: HoldingCostRow[] = [];
  for (const raw of holdings) {
    const h = asRecord(raw);
    const id = String(h.id ?? "").trim();
    const portfolio_id = String(h.portfolio_id ?? "").trim();
    const ticker = String(h.ticker ?? "").trim().toUpperCase();
    if (!id || !portfolio_id || !ticker) continue;
    out.push({
      id,
      portfolio_id,
      ticker,
      shares: finiteNumber(h.shares),
      buy_price: finiteNumber(h.buy_price),
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

function holdingCost(row: HoldingCostRow): number {
  return roundMoney(row.shares * row.buy_price);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(rec[k])}`)
    .join(",")}}`;
}

export function bookChecksumFromRows(
  cash: CashRow[],
  holdings: HoldingCostRow[]
): BookChecksum {
  const cashSum = sumMoney(cash.map((p) => p.cash_balance));
  const holdingsCostSum = sumMoney(holdings.map(holdingCost));
  const bookSum = roundMoney(cashSum + holdingsCostSum);
  const sha256 = createHash("sha256")
    .update(stableStringify({ cash, holdings }))
    .digest("hex");
  return {
    cashSum,
    holdingsCostSum,
    bookSum,
    portfolioCount: cash.length,
    holdingCount: holdings.length,
    sha256,
  };
}

export function bookChecksum(payload: BookSnapshotPayload): BookChecksum {
  return bookChecksumFromRows(
    portfolioCashRows(payload.portfolios),
    holdingCostRows(payload.holdings)
  );
}

export function checksumsMatch(a: BookChecksum, b: BookChecksum): boolean {
  return (
    a.cashSum === b.cashSum &&
    a.holdingsCostSum === b.holdingsCostSum &&
    a.bookSum === b.bookSum &&
    a.portfolioCount === b.portfolioCount &&
    a.holdingCount === b.holdingCount &&
    a.sha256 === b.sha256
  );
}

/**
 * Postgres SUM that must match `bookChecksum`. ROUND(shares * buy_price, 2)
 * per row, then add cash, so binary float in JS and numeric in PG land on
 * the same cent.
 */
export const BOOK_SUM_SQL = `COALESCE((SELECT SUM(cash_balance) FROM portfolios), 0)
 + COALESCE((SELECT SUM(ROUND((shares * buy_price)::numeric, 2)) FROM holdings), 0)`;
