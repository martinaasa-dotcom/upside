/** Simple dividend / premium cashflow log. */

export type CashflowEntry = {
  id: string;
  at: string;
  kind: "dividend" | "premium" | "deposit" | "withdrawal";
  ticker?: string;
  amount: number;
  note: string;
};

const KEY = "upside-cashflow-v1";

export function loadCashflows(): CashflowEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CashflowEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCashflows(entries: CashflowEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 400)));
  } catch {
    /* ignore */
  }
}

export function addCashflow(
  entries: CashflowEntry[],
  partial: Omit<CashflowEntry, "id" | "at">
): CashflowEntry[] {
  const entry: CashflowEntry = {
    ...partial,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
  };
  const next = [entry, ...entries].slice(0, 400);
  saveCashflows(next);
  return next;
}

export function removeCashflow(
  entries: CashflowEntry[],
  id: string
): CashflowEntry[] {
  const next = entries.filter((e) => e.id !== id);
  saveCashflows(next);
  return next;
}

export function trailingIncome(entries: CashflowEntry[], days = 365): number {
  const cut = Date.now() - days * 86400000;
  return entries
    .filter(
      (e) =>
        new Date(e.at).getTime() >= cut &&
        (e.kind === "dividend" || e.kind === "premium")
    )
    .reduce((s, e) => s + e.amount, 0);
}

export function netCashMoves(entries: CashflowEntry[], days = 365): number {
  const cut = Date.now() - days * 86400000;
  return entries
    .filter((e) => new Date(e.at).getTime() >= cut)
    .reduce((s, e) => {
      if (e.kind === "withdrawal") return s - Math.abs(e.amount);
      if (e.kind === "deposit") return s + e.amount;
      return s + e.amount;
    }, 0);
}
