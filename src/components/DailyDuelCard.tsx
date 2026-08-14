"use client";

import { useEffect, useMemo, useState } from "react";
import { Swords } from "lucide-react";
import { cn, percent, cashtag } from "@/lib/format";
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
  compact?: boolean;
  /** When set, today's pair and picks are shared with the circle. */
  communityId?: string;
};

type CommunityDuel = {
  dayKey: string;
  pair: { a: string; b: string } | null;
  myPick: DuelPick | null;
  counts: { a: number; b: number };
  names?: { a: string[]; b: string[] };
  settled: boolean;
  pickCount: number;
};

/** Pick who finishes the US cash session higher — reveal only after the close. */
export function DailyDuelCard({
  tickers,
  compact = false,
  communityId,
}: Props) {
  const dayKey = todayKeyInTz();
  const tickerList = useMemo(() => tickers.map((t) => t.ticker), [tickers]);
  const pctByTicker = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const t of tickers) map[t.ticker] = t.todayPct;
    return map;
  }, [tickers]);

  const [record, setRecord] = useState<DuelRecord | null>(null);
  const [community, setCommunity] = useState<CommunityDuel | null>(null);
  const [stats, setStats] = useState(() => duelStats(loadDuelHistory()));
  const [canSettle, setCanSettle] = useState(() => duelCanSettle());

  useEffect(() => {
    if (communityId) return;
    setRecord(getOrCreateTodaysDuel(tickerList, dayKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId, dayKey, tickerList.join("|")]);

  useEffect(() => {
    if (!communityId) return;
    let cancelled = false;
    void fetch(`/api/communities/${communityId}/duel`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CommunityDuel | null) => {
        if (!cancelled && data) setCommunity(data);
      })
      .catch(() => {
        /* keep whatever we have */
      });
    return () => {
      cancelled = true;
    };
  }, [communityId, dayKey]);

  useEffect(() => {
    const tick = () => setCanSettle(duelCanSettle());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (communityId) return;
    if (!record || record.pick == null || record.outcome !== "pending") return;
    if (!canSettle) return;
    const updated = resolvePendingOutcome(dayKey, pctByTicker);
    if (updated && updated.outcome !== "pending") {
      setRecord(updated);
      setStats(duelStats(loadDuelHistory()));
    }
  }, [communityId, record, pctByTicker, dayKey, canSettle]);

  const pair = communityId
    ? community?.pair ?? null
    : record
      ? { a: record.tickerA, b: record.tickerB }
      : null;
  const myPick = communityId ? (community?.myPick ?? null) : (record?.pick ?? null);

  if (!pair) return null;

  function pick(choice: DuelPick) {
    if (communityId) {
      if (community?.myPick) return;
      setCommunity((prev) =>
        prev
          ? {
              ...prev,
              myPick: choice,
              pickCount: prev.pickCount + 1,
              counts: {
                ...prev.counts,
                [choice]: prev.counts[choice] + 1,
              },
            }
          : prev
      );
      void fetch(`/api/communities/${communityId}/duel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pick: choice }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then(() =>
          fetch(`/api/communities/${communityId}/duel`, { cache: "no-store" })
        )
        .then((r) => (r && r.ok ? r.json() : null))
        .then((data: CommunityDuel | null) => {
          if (data) setCommunity(data);
        })
        .catch(() => {
          /* optimistic pick stays */
        });
      return;
    }
    const updated = makeDuelPick(dayKey, choice, pctByTicker);
    if (updated) {
      setRecord(updated);
      setStats(duelStats(loadDuelHistory()));
    }
  }

  const decided = communityId
    ? Boolean(community?.settled && myPick)
    : Boolean(record && record.pick != null && record.outcome !== "pending");
  const resultLine =
    !communityId && record && decided ? duelResultLine(record) : null;
  const waitingOnClose = myPick != null && !decided;

  const communityLine = communityId
    ? myPick == null
      ? "Same matchup for everyone here. One tap locks it."
      : waitingOnClose
        ? canSettle
          ? "Locked in, waiting on session quotes to settle …"
          : `${community?.pickCount ?? 1} pick${(community?.pickCount ?? 1) === 1 ? "" : "s"} in. Results after the US close (4pm ET).`
        : communityVoteLine(community, pair)
    : null;

  return (
    <section
      className={cn(
        "overview-fade rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] p-4",
        !compact && "sm:p-6"
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-sky-500/15 p-2 text-sky-300">
            <Swords className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Daily Duel</h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              {communityId
                ? "The circle's pick. Who finishes the US session higher."
                : "Tap who you think finishes the US session higher. Locks until 4pm ET."}
            </p>
          </div>
        </div>
        {communityId && (community?.pickCount ?? 0) > 0 ? (
          <p className="shrink-0 text-xs text-zinc-400">
            <span className="font-semibold tabular-nums text-zinc-200">
              {community?.pickCount ?? 0}
            </span>
            {(community?.pickCount ?? 0) === 1 ? " pick" : " picks"}
          </p>
        ) : (
          !communityId &&
          stats.totalPlayed > 0 && (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 text-right">
              <p className="text-xs uppercase tracking-wide text-zinc-400">
                Record
              </p>
              <p className="text-sm font-semibold tabular-nums text-white">
                {stats.totalCorrect}/{stats.totalPlayed}
                <span className="ml-1.5 font-normal text-zinc-400">
                  ({percent(stats.accuracyPct ?? 0, 0)})
                </span>
              </p>
              {stats.currentStreak >= 2 && (
                <p className="text-xs text-amber-300">
                  {stats.currentStreak} in a row
                </p>
              )}
            </div>
          )
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(["a", "b"] as const).map((side) => {
          const ticker = side === "a" ? pair.a : pair.b;
          const pct = decided
            ? communityId
              ? (pctByTicker[ticker] ?? null)
              : side === "a"
                ? record?.revealedPctA ?? null
                : record?.revealedPctB ?? null
            : null;
          const isPick = myPick === side;
          const isWinner =
            decided &&
            pct != null &&
            (side === "a"
              ? (pctByTicker[pair.a] ?? 0) >= (pctByTicker[pair.b] ?? 0)
              : (pctByTicker[pair.b] ?? 0) >= (pctByTicker[pair.a] ?? 0));
          const localWinner =
            !communityId &&
            decided &&
            record?.revealedPctA != null &&
            record?.revealedPctB != null &&
            (side === "a"
              ? record.revealedPctA >= record.revealedPctB
              : record.revealedPctB >= record.revealedPctA);
          const win = communityId ? isWinner : localWinner;
          return (
            <button
              key={side}
              type="button"
              disabled={myPick != null}
              onClick={() => pick(side)}
              className={cn(
                "touch-target rounded-2xl border px-4 py-5 text-center transition",
                myPick == null
                  ? "border-zinc-700 bg-zinc-900/40 hover:border-sky-400/60 hover:bg-sky-500/10 active:scale-[0.98]"
                  : win
                    ? "border-emerald-500/50 bg-emerald-500/10"
                    : waitingOnClose && isPick
                      ? "border-sky-500/40 bg-sky-500/10"
                      : "border-zinc-800 bg-zinc-950/40 opacity-70",
                isPick && "ring-2 ring-sky-400/60"
              )}
            >
              <p className="text-2xl font-bold tracking-tight text-white">
                {cashtag(ticker)}
              </p>
              {isPick && (
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-sky-300">
                  Your pick
                </p>
              )}
              {communityId &&
                community?.settled &&
                (community?.counts[side] ?? 0) > 0 && (
                <p className="mt-1 text-xs text-zinc-400">
                  {community.counts[side]} vote
                  {community.counts[side] === 1 ? "" : "s"}
                </p>
              )}
              {waitingOnClose && isPick && !communityId && (
                <p className="mt-2 text-sm text-zinc-400">Locked · no peek</p>
              )}
              {waitingOnClose && !isPick && !communityId && (
                <p className="mt-2 text-sm text-zinc-400">—</p>
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
        {communityId
          ? communityLine
          : myPick == null
            ? "One tap locks it. No take-backs, and no live percent until the US close."
            : waitingOnClose
              ? canSettle
                ? "Locked in, waiting on session quotes to settle …"
                : "Locked in. Results unlock after the US close (4pm ET)."
              : resultLine}
      </p>
    </section>
  );
}

function communityVoteLine(
  community: CommunityDuel | null,
  pair: { a: string; b: string }
): string {
  if (!community) return "Locked in.";
  const a = community.counts.a;
  const b = community.counts.b;
  const namesA = community.names?.a?.join(", ");
  const namesB = community.names?.b?.join(", ");
  const split = `${cashtag(pair.a)} ${a} · ${cashtag(pair.b)} ${b}`;
  if (namesA || namesB) {
    const bits = [
      namesA ? `${cashtag(pair.a)}: ${namesA}` : null,
      namesB ? `${cashtag(pair.b)}: ${namesB}` : null,
    ].filter(Boolean);
    return `${split}. ${bits.join(". ")}`;
  }
  return split;
}
