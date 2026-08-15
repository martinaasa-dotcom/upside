"use client";

import { currency, percent, signedCurrency, signedTone } from "@/lib/format";
import type { ThesisCoverage } from "@/lib/classroom";
import type { Holding, Quote } from "@/lib/types";

type RosterMember = {
  id: string;
  name: string;
  isYou: boolean;
  sheetCount: number;
  totalValue: number;
  todayDollar: number;
  topTicker: string | null;
  topWeight: number | null;
};

export function ClassroomRoster({
  members,
  startingCash,
  holdings,
  quotes,
  ownership,
  thesisCoverage,
  onOpen,
}: {
  members: RosterMember[];
  startingCash: number;
  holdings: Holding[];
  quotes: Record<string, Quote>;
  ownership: { portfolio_id: string; user_id: string }[];
  thesisCoverage: Record<string, ThesisCoverage>;
  onOpen: (memberId: string) => void;
}) {
  const rows = [...members].sort((a, b) => b.totalValue - a.totalValue);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-card/80">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Roster</h2>
        <p className="mt-0.5 text-xs text-zinc-400">
          Same start. Live prices. Who wrote a why, who is all-in on one name.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400">
              <th className="px-4 py-2 font-medium">Student</th>
              <th className="px-3 py-2 font-medium">Now</th>
              <th className="px-3 py-2 font-medium">vs start</th>
              <th className="px-3 py-2 font-medium">Today</th>
              <th className="px-3 py-2 font-medium">Why</th>
              <th className="px-3 py-2 font-medium">Biggest</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                  Nobody in the class yet.
                </td>
              </tr>
            ) : (
              rows.map((m) => {
                const vsStart = m.sheetCount
                  ? m.totalValue - startingCash
                  : null;
                const vsStartPct =
                  vsStart != null && startingCash > 0
                    ? vsStart / startingCash
                    : null;
                const thesis = thesisCoverage[m.id];
                const sheetIds = new Set(
                  ownership
                    .filter((o) => o.user_id === m.id)
                    .map((o) => o.portfolio_id)
                );
                const top = topHolding(holdings, quotes, sheetIds);
                const biggest = m.topTicker
                  ? { ticker: m.topTicker, weight: m.topWeight }
                  : top;
                return (
                  <tr
                    key={m.id}
                    className="border-b border-zinc-800/80 last:border-0"
                  >
                    <td className="px-4 py-2.5">
                      {m.sheetCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => onOpen(m.id)}
                          className="text-left font-medium text-zinc-100 hover:text-white"
                        >
                          {m.name}
                          {m.isYou ? (
                            <span className="ml-1.5 font-normal text-zinc-500">
                              you
                            </span>
                          ) : null}
                        </button>
                      ) : (
                        <span className="font-medium text-zinc-300">
                          {m.name}
                          {m.isYou ? (
                            <span className="ml-1.5 font-normal text-zinc-500">
                              you
                            </span>
                          ) : null}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-zinc-200">
                      {m.sheetCount ? currency(m.totalValue) : "—"}
                    </td>
                    <td
                      className={`px-3 py-2.5 tabular-nums ${
                        vsStart == null
                          ? "text-zinc-500"
                          : signedTone(vsStart)
                      }`}
                    >
                      {vsStart == null
                        ? "—"
                        : `${signedCurrency(vsStart)}${
                            vsStartPct != null
                              ? ` · ${percent(vsStartPct)}`
                              : ""
                          }`}
                    </td>
                    <td
                      className={`px-3 py-2.5 tabular-nums ${
                        m.sheetCount ? signedTone(m.todayDollar) : "text-zinc-500"
                      }`}
                    >
                      {m.sheetCount ? signedCurrency(m.todayDollar) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-300">
                      {!m.sheetCount
                        ? "—"
                        : !thesis || thesis.names === 0
                          ? "No names yet"
                          : thesis.withWhy === 0
                            ? "No why yet"
                            : `${thesis.withWhy} of ${thesis.names}`}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-300">
                      {biggest?.ticker
                        ? `${biggest.ticker}${
                            biggest.weight != null
                              ? ` · ${Math.round(biggest.weight)}%`
                              : ""
                          }`
                        : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function topHolding(
  holdings: Holding[],
  quotes: Record<string, Quote>,
  sheetIds: Set<string>
): { ticker: string; weight: number } | null {
  const mine = holdings.filter((h) => sheetIds.has(h.portfolio_id));
  if (!mine.length) return null;
  const values = mine.map((h) => ({
    ticker: h.ticker,
    value: h.shares * (quotes[h.ticker]?.price ?? 0),
  }));
  const total = values.reduce((s, v) => s + v.value, 0);
  const top = [...values].sort((a, b) => b.value - a.value)[0];
  if (!top || total <= 0) return null;
  return { ticker: top.ticker, weight: (top.value / total) * 100 };
}
