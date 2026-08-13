"use client";

import { useEffect, useMemo, useState } from "react";
import { Swords } from "lucide-react";
import { cn, percent } from "@/lib/format";
import {
  duelCanSettle,
  duelResultLine,
  duelStats,
  getOrCreateTodaysDuel,
  loadDuelHistory,
  makeDuelPick,
  resolvePendingOutcome,
  type DuelPick,
  type DuelRecord,
} from "@/lib/daily-duel";
import { todayKeyInTz } from "@/lib/timezone";

type Props = {
  tickers: Array<{ ticker: string; todayPct: number | null }>;
};

/** Pick who finishes the US cash session higher — reveal only after the close. */
export function DailyDuelCard({ tickers }: Props) {
  const dayKey = todayKeyInTz();
  const tickerList = useMemo(() => tickers.map((t) => t.ticker), [tickers]);
  const pctByTicker = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const t of tickers) map[t.ticker] = t.todayPct;
    return map;
  }, [tickers]);

  const [record, setRecord] = useState<DuelRecord | null>(null);
  const [stats, setStats] = useState(() => duelStats(loadDuelHistory()));
  const [canSettle, setCanSettle] = useState(() => duelCanSettle());

  useEffect(() => {
    setRecord(getOrCreateTodaysDuel(tickerList, dayKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, tickerList.join("|")]);

  useEffect(() => {
    const tick = () => setCanSettle(duelCanSettle());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!record || record.pick == null || record.outcome !== "pending") return;
    if (!canSettle) return;
    const updated = resolvePendingOutcome(dayKey, pctByTicker);
    if (updated && updated.outcome !== "pending") {
      setRecord(updated);
      setStats(duelStats(loadDuelHistory()));
    }
  }, [record, pctByTicker, dayKey, canSettle]);

  if (!record) return null;

  function pick(choice: DuelPick) {
    const updated = makeDuelPick(dayKey, choice, pctByTicker);
    if (updated) {
      setRecord(updated);
      setStats(duelStats(loadDuelHistory()));
    }
  }

  const decided = record.pick != null && record.outcome !== "pending";
  const resultLine = decided ? duelResultLine(record) : null;
  const waitingOnClose = record.pick != null && record.outcome === "pending";

  return (
    <section className="overview-fade rounded-3xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 via-[#161618]/40 to-[#161618]/40 p-4 sm:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-sky-500/15 p-2 text-sky-300">
            <Swords className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-white">Daily Duel</h3>
            <p className="mt-1 text-base text-zinc-400">
              Who ends the day higher — settles after the US close
            </p>
          </div>
        </div>
        {stats.totalPlayed > 0 && (
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 text-right">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">
              Record
            </p>
            <p className="text-sm font-semibold tabular-nums text-white">
              {stats.totalCorrect}/{stats.totalPlayed}
              <span className="ml-1.5 font-normal text-zinc-500">
                ({percent(stats.accuracyPct ?? 0, 0)})
              </span>
            </p>
            {stats.currentStreak >= 2 && (
              <p className="text-[11px] text-amber-300">
                🔥 {stats.currentStreak} in a row
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(["a", "b"] as const).map((side) => {
          const ticker = side === "a" ? record.tickerA : record.tickerB;
          const pct = decided
            ? side === "a"
              ? record.revealedPctA
              : record.revealedPctB
            : null;
          const isPick = record.pick === side;
          const isWinner =
            decided &&
            record.revealedPctA != null &&
            record.revealedPctB != null &&
            (side === "a"
              ? record.revealedPctA >= record.revealedPctB
              : record.revealedPctB >= record.revealedPctA);
          return (
            <button
              key={side}
              type="button"
              disabled={record.pick != null}
              onClick={() => pick(side)}
              className={cn(
                "touch-target rounded-2xl border px-4 py-5 text-center transition",
                record.pick == null
                  ? "border-zinc-700 bg-zinc-900/40 hover:border-sky-400/60 hover:bg-sky-500/10 active:scale-[0.98]"
                  : isWinner
                    ? "border-emerald-500/50 bg-emerald-500/10"
                    : waitingOnClose && isPick
                      ? "border-sky-500/40 bg-sky-500/10"
                      : "border-zinc-800 bg-zinc-950/40 opacity-70",
                isPick && "ring-2 ring-sky-400/60"
              )}
            >
              <p className="text-2xl font-bold tracking-tight text-white">
                {ticker}
              </p>
              {isPick && (
                <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-sky-300">
                  Your pick
                </p>
              )}
              {waitingOnClose && isPick && (
                <p className="mt-2 text-sm text-zinc-500">Locked · no peek</p>
              )}
              {waitingOnClose && !isPick && (
                <p className="mt-2 text-sm text-zinc-600">—</p>
              )}
              {pct != null && (
                <p
                  className={cn(
                    "mt-2 text-lg font-semibold tabular-nums",
                    pct > 0
                      ? "text-gain"
                      : pct < 0
                        ? "text-loss"
                        : "text-zinc-400"
                  )}
                >
                  {percent(pct)}
                </p>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-center text-sm leading-relaxed text-zinc-400">
        {record.pick == null
          ? "Predict the closer — tap to lock it. No take-backs, no live % until 4pm ET."
          : waitingOnClose
            ? canSettle
              ? "Locked in — waiting on session quotes to settle …"
              : "Locked in. Results unlock after the US close (4pm ET)."
            : resultLine}
      </p>
    </section>
  );
}
