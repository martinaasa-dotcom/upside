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

/** Fingerprint so calendar “Log premium” doesn’t double-book the same modeled fill. */
export function premiumLogKey(ticker: string, amount: number, expiry?: string) {
  const exp = (expiry ?? "—").trim() || "—";
  return `cc-prem:${ticker.toUpperCase()}:${exp}:${Math.round(amount * 100)}`;
}

export function alreadyLoggedPremium(
  entries: CashflowEntry[],
  ticker: string,
  amount: number,
  expiry?: string,
  withinHours = 72
): boolean {
  const key = premiumLogKey(ticker, amount, expiry);
  const cut = Date.now() - withinHours * 3600_000;
  return entries.some(
    (e) =>
      e.kind === "premium" &&
      e.note.includes(key) &&
      new Date(e.at).getTime() >= cut
  );
}

/** One-tap from CC calendar → cashflow (season meter). */
export function logPremiumFromCc(
  entries: CashflowEntry[],
  input: {
    ticker: string;
    amount: number;
    expiry?: string;
    contracts?: number;
  }
): { entries: CashflowEntry[]; already: boolean } {
  const amount = Math.round(input.amount * 100) / 100;
  if (!(amount > 0)) return { entries, already: false };
  if (alreadyLoggedPremium(entries, input.ticker, amount, input.expiry)) {
    return { entries, already: true };
  }
  const key = premiumLogKey(input.ticker, amount, input.expiry);
  const ct =
    input.contracts != null && input.contracts > 0
      ? ` · ${input.contracts} ct`
      : "";
  const exp = input.expiry && input.expiry !== "—" ? ` exp ${input.expiry}` : "";
  return {
    already: false,
    entries: addCashflow(entries, {
      kind: "premium",
      ticker: input.ticker.toUpperCase(),
      amount,
      note: `CC premium${exp}${ct} · ${key}`,
    }),
  };
}
