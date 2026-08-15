import type { TickerScore } from "@/lib/overview";

export type OverlapRow = {
  ticker: string;
  people: string[];
  todayPct: number | null;
};

/** Names that show up in more than one book, most-shared first. */
export function overlapRows(
  tickers: TickerScore[],
  peopleFor: (portfolioIds: string[]) => string[]
): OverlapRow[] {
  return tickers
    .map((t) => ({
      ticker: t.ticker,
      people: [...new Set(peopleFor(t.portfolioIds).filter(Boolean))],
      todayPct: t.todayPct,
    }))
    .filter((row) => row.people.length >= 2)
    .sort((a, b) => {
      const byPeople = b.people.length - a.people.length;
      if (byPeople !== 0) return byPeople;
      return Math.abs(b.todayPct ?? 0) - Math.abs(a.todayPct ?? 0);
    })
    .slice(0, 5);
}
