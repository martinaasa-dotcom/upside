import { finiteNumber, roundMoney } from "@/lib/money";

/** Paper class sheets keep a cash ledger. Real books do not. */
export function tracksTradeCash(portfolio: {
  classroom_community_id?: string | null;
}): boolean {
  return Boolean(portfolio.classroom_community_id);
}

/** Cash that counts toward the total. Real books never go below zero. */
export function sheetCashBalance(portfolio: {
  cash_balance: number;
  classroom_community_id?: string | null;
}): number {
  const cash = finiteNumber(portfolio.cash_balance);
  if (tracksTradeCash(portfolio)) return cash;
  return roundMoney(Math.max(0, cash));
}
