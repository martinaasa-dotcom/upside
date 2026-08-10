/** Trade journal + what-if counterfactuals (localStorage). */

export type JournalEntry = {
  id: string;
  at: string;
  ticker: string;
  side: "buy" | "sell" | "trim" | "note";
  shares: number;
  price: number;
  note: string;
  portfolioId?: string;
};

const KEY = "upside-trade-journal-v1";

export function loadJournal(): JournalEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as JournalEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveJournal(entries: JournalEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 500)));
  } catch {
    /* ignore */
  }
}

export function addJournalEntry(
  entries: JournalEntry[],
  partial: Omit<JournalEntry, "id" | "at">
): JournalEntry[] {
  const entry: JournalEntry = {
    ...partial,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
  };
  const next = [entry, ...entries].slice(0, 500);
  saveJournal(next);
  return next;
}

export function removeJournalEntry(
  entries: JournalEntry[],
  id: string
): JournalEntry[] {
  const next = entries.filter((e) => e.id !== id);
  saveJournal(next);
  return next;
}

/** P&L if shares sold at `exitPrice` were instead held to `nowPrice`. */
export function whatIfHeld(opts: {
  shares: number;
  exitPrice: number;
  nowPrice: number;
}): { missedDollar: number; missedPct: number } {
  const { shares, exitPrice, nowPrice } = opts;
  const missedDollar = shares * (nowPrice - exitPrice);
  const missedPct = exitPrice > 0 ? (nowPrice - exitPrice) / exitPrice : 0;
  return { missedDollar, missedPct };
}
