import { cashtag, percent } from "@/lib/format";
import type { TickerScore } from "@/lib/overview";

function listNames(names: string[]): string {
  if (names.length === 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const last = names[names.length - 1];
  return `${names.slice(0, -1).join(", ")}, and ${last}`;
}

function signedPct(pct: number): string {
  const n = percent(Math.abs(pct));
  if (pct > 0) return `+${n}`;
  if (pct < 0) return `-${n}`;
  return n;
}

/** Overlap as sentences, using people, not sheet chips. */
export function overlapSentences(
  tickers: TickerScore[],
  peopleFor: (portfolioIds: string[]) => string[]
): string[] {
  return tickers
    .map((t) => ({
      t,
      people: [...new Set(peopleFor(t.portfolioIds).filter(Boolean))],
    }))
    .filter((row) => row.people.length >= 2)
    .sort((a, b) => {
      const byPeople = b.people.length - a.people.length;
      if (byPeople !== 0) return byPeople;
      return Math.abs(b.t.todayPct ?? 0) - Math.abs(a.t.todayPct ?? 0);
    })
    .slice(0, 5)
    .map((row) => {
      const move =
        row.t.todayPct != null
          ? ` It was ${signedPct(row.t.todayPct)} today.`
          : "";
      return `${cashtag(row.t.ticker)} is in ${listNames(row.people)}.${move}`;
    });
}
