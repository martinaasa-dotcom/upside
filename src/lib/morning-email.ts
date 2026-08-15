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

function signedUsd(n: number): string {
  const abs = Math.round(Math.abs(n)).toLocaleString("en-US");
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

export function buildMorningEmailText(input: NoteInput): string {
  const tape = bookTape(input);
  const lines = [
    input.name ? `Morning, ${input.name}.` : "Morning.",
    `Book ${Math.round(tape.book).toLocaleString("en-US")}. Today ${signedUsd(tape.today)}.`,
    tape.quiet
      ? "Quiet day. Book barely moved."
      : tape.top
        ? `${cashtag(tape.top.ticker)} is the name making noise, ${tape.top.pct >= 0 ? "+" : ""}${(tape.top.pct * 100).toFixed(1)}%.`
        : "Prices are still coming in.",
    "Open Upside Lab if you want Pulse or the Fund.",
    "You're getting this because you turned on the morning note. Account turns it off.",
  ];
  return lines.join("\n");
}

export function buildCloseEmailText(input: NoteInput): string {
  const tape = bookTape(input);
  const lines = [
    input.name ? `After the close, ${input.name}.` : "After the close.",
    `${signedUsd(tape.today)} on the book.`,
    tape.top
      ? `${cashtag(tape.top.ticker)} was the name that did it.`
      : "No single name stood out.",
    "Open Upside Lab if you want Pulse.",
    "You're getting this because you turned on the morning note. Account turns it off.",
  ];
  return lines.join("\n");
}

export function buildSundayEmailText(input: NoteInput): string {
  const tape = bookTape(input);
  const lines = [
    input.name ? `Sunday look, ${input.name}.` : "Sunday look.",
    `Book ${Math.round(tape.book).toLocaleString("en-US")}.`,
    tape.best
      ? `Best tape: ${cashtag(tape.best.ticker)} ${tape.best.pct >= 0 ? "+" : ""}${(tape.best.pct * 100).toFixed(1)}%.`
      : null,
    tape.worst && tape.worst.ticker !== tape.best?.ticker
      ? `Worst tape: ${cashtag(tape.worst.ticker)} ${tape.worst.pct >= 0 ? "+" : ""}${(tape.worst.pct * 100).toFixed(1)}%.`
      : null,
    "Open Upside Lab if you want Pulse or the Fund.",
    "You're getting this because you turned on the morning note. Account turns it off.",
  ];
  return lines.filter((x): x is string => Boolean(x)).join("\n");
}
