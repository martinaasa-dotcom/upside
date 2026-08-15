import { cashtag } from "@/lib/format";
import { todayDollarFor } from "@/lib/overview";
import type { Quote } from "@/lib/types";

type HoldingRow = {
  ticker: string;
  shares: number;
  buy_price: number;
};

type NoteInput = {
  name: string | null;
  cash: number;
  holdings: HoldingRow[];
  quotes: Record<string, Quote>;
};

function bookTape(input: NoteInput) {
  let equity = 0;
  let today = 0;
  const movers: Array<{ ticker: string; pct: number; dollar: number }> = [];
  for (const h of input.holdings) {
    const q = input.quotes[h.ticker.toUpperCase()];
    const price = q?.price ?? h.buy_price;
    const value = h.shares * price;
    equity += value;
    const move = todayDollarFor(value, q?.changePercent);
    today += move.dollar;
    if (move.pct != null) {
      movers.push({ ticker: h.ticker, pct: move.pct, dollar: move.dollar });
    }
  }
  const book = equity + input.cash;
  movers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  const byPct = [...movers].sort((a, b) => b.pct - a.pct);
  return {
    book,
    today,
    top: movers[0] ?? null,
    best: byPct[0] ?? null,
    worst: byPct[byPct.length - 1] ?? null,
    quiet: Math.abs(today) < book * 0.005,
  };
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function signedMoney(n: number): string {
  const abs = money(Math.abs(n));
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

function signedPct(pct: number): string {
  const n = `${(Math.abs(pct) * 100).toFixed(1)}%`;
  if (pct > 0) return `+${n}`;
  if (pct < 0) return `-${n}`;
  return n;
}

function greeting(name: string | null, lead: string): string {
  return name ? `${lead}, ${name}.` : `${lead}.`;
}

function joinNote(lines: Array<string | null>): string {
  return lines.filter((x): x is string => Boolean(x)).join("\n\n");
}

export function buildMorningEmailText(input: NoteInput): string {
  const tape = bookTape(input);
  return joinNote([
    greeting(input.name, "Morning"),
    tape.quiet
      ? `Your book is ${money(tape.book)}. Barely moved.`
      : `Your book is ${money(tape.book)}. Today ${signedMoney(tape.today)}.`,
    tape.quiet
      ? "That's the whole note."
      : tape.top
        ? `${cashtag(tape.top.ticker)} did most of that, ${signedPct(tape.top.pct)}.`
        : "Prices are still coming in.",
    tape.quiet ? null : "Nothing you have to do.",
    "Account turns this off.",
  ]);
}

export function buildCloseEmailText(input: NoteInput): string {
  const tape = bookTape(input);
  return joinNote([
    greeting(input.name, "After the close"),
    tape.quiet
      ? `Your book is ${money(tape.book)}. A quiet session.`
      : `Today finished ${signedMoney(tape.today)}.`,
    tape.quiet
      ? "See you in the morning."
      : tape.top
        ? `${cashtag(tape.top.ticker)} did most of that.`
        : "No single name stood out.",
    tape.quiet ? null : "See you in the morning.",
    "Account turns this off.",
  ]);
}

export function buildSundayEmailText(input: NoteInput): string {
  const tape = bookTape(input);
  return joinNote([
    greeting(input.name, "Sunday"),
    `Your book is ${money(tape.book)}.`,
    tape.best
      ? `Biggest recent move: ${cashtag(tape.best.ticker)}, ${signedPct(tape.best.pct)}.`
      : null,
    tape.worst && tape.worst.ticker !== tape.best?.ticker
      ? `Softest name: ${cashtag(tape.worst.ticker)}, ${signedPct(tape.worst.pct)}.`
      : null,
    "That's enough for a Sunday.",
    "Account turns this off.",
  ]);
}
