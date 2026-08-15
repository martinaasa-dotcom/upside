import { cashtag } from "@/lib/format";
import { todayDollarFor } from "@/lib/overview";
import type { Quote } from "@/lib/types";

type HoldingRow = {
  ticker: string;
  shares: number;
  buy_price: number;
};

export function buildMorningEmailText(input: {
  name: string | null;
  cash: number;
  holdings: HoldingRow[];
  quotes: Record<string, Quote>;
}): string {
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
  const top = movers[0];
  const quiet = Math.abs(today) < book * 0.005;
  const lines = [
    input.name ? `Morning, ${input.name}.` : "Morning.",
    `Book ${Math.round(book).toLocaleString("en-US")}. Today ${today >= 0 ? "+" : ""}${Math.round(today).toLocaleString("en-US")}.`,
    quiet
      ? "Quiet day. Book barely moved."
      : top
        ? `${cashtag(top.ticker)} is the name making noise, ${top.pct >= 0 ? "+" : ""}${(top.pct * 100).toFixed(1)}%.`
        : "Prices are still coming in.",
    "Open Upside Lab if you want Pulse or the Fund.",
    "You're getting this because you turned on the morning note. Account turns it off.",
  ];
  return lines.join("\n");
}
