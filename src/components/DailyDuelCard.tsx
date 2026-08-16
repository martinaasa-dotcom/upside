"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import {
  loadCommunityDuelCache,
  saveCommunityDuelCache,
  type CommunityDuelCache,
} from "@/lib/community-cache";
import { Swords } from "lucide-react";
import { cn, percent, cashtag } from "@/lib/format";
import {
  duelCanSettle,
  duelResultLine,
  duelStats,
  getOrCreateTodaysDuel,
  loadDuelHistory,
  makeDuelPick,
  pickTodaysDuel,
  resolvePendingOutcome,
  type DuelPick,
  type DuelRecord,
} from "@/lib/daily-duel";
import { todayKeyInTz } from "@/lib/timezone";

/** What the server sees: no local history, so nothing played yet. */
const EMPTY_DUEL_STATS = duelStats([]);

type Props = {
  tickers: Array<{ ticker: string; todayPct: number | null }>;
  compact?: boolean;
  /** When set, today's pair and picks are shared with the circle. */
  communityId?: string;
};

type CommunityDuel = CommunityDuelCache;

/** Pick who finishes the US cash session higher — reveal only after the close. */
export function DailyDuelCard({
  tickers,
  compact = false,
  communityId,
}: Props) {
  const dayKey = todayKeyInTz();
  const tickerList = useMemo(() => tickers.map((t) => t.ticker), [tickers]);
  // Identity of the ticker set, so effects below can depend on what the list
  // *is* rather than on a fresh array reference every render.
  const tickerKey = useMemo(() => tickerList.join("|"), [tickerList]);
  const pctByTicker = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const t of tickers) map[t.ticker] = t.todayPct;
    return map;
  }, [tickers]);

  const [record, setRecord] = useState<DuelRecord | null>(null);
  const [community, setCommunity] = useHydratedCache<CommunityDuel | null>(
    () => (communityId ? loadCommunityDuelCache(communityId, dayKey) : null),
    null
  );

  function commitCommunity(next: CommunityDuel | null) {
    if (communityId && next) saveCommunityDuelCache(communityId, next);
    setCommunity(next);
  }
  // Both read browser-only state, so they start at the server-safe value and
  // hydrate before paint rather than during render.
  const [stats, setStats] = useHydratedCache(
    () => duelStats(loadDuelHistory()),
    EMPTY_DUEL_STATS
  );
  const [canSettle, setCanSettle] = useState(false);

  useLayoutEffect(() => {
    if (communityId) return;
    setRecord(getOrCreateTodaysDuel(tickerList, dayKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on tickerKey, not the array identity
  }, [communityId, dayKey, tickerKey]);

  useLayoutEffect(() => {
    if (!communityId) return;
    const cached = loadCommunityDuelCache(communityId, dayKey);
    if (cached) setCommunity(cached);
  }, [communityId, dayKey, setCommunity]);

  useEffect(() => {
    if (!communityId) return;
    const ctrl = new AbortController();
    void fetch(`/api/communities/${communityId}/duel`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: CommunityDuel | null) => {
        if (!ctrl.signal.aborted && data) commitCommunity(data);
      })
      .catch(() => {
        /* keep whatever we have */
      });
    return () => {
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commitCommunity is local
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
    // setStats comes from a custom hook, so the linter can't see that it's a
    // useState setter and therefore stable. Listing it is free.
  }, [communityId, record, pctByTicker, dayKey, canSettle, setStats]);

  const instantPair = useMemo(
    () => pickTodaysDuel(tickerList, dayKey, communityId ?? ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on tickerKey, not the array identity
    [dayKey, communityId, tickerKey]
  );
  const pair = communityId
    ? community?.pair ?? instantPair
    : record
      ? { a: record.tickerA, b: record.tickerB }
      : instantPair;
  const myPick = communityId ? (community?.myPick ?? null) : (record?.pick ?? null);

  if (!pair) {
    return (
      <section
        className={cn(
          "overview-fade min-h-[13.5rem] rounded-2xl border border-brand/25 bg-brand/[0.06] p-4",
          !compact && "sm:p-6"
        )}
      >
        <div className="mb-3 flex items-center gap-2.5">
          <div className="rounded-xl bg-brand/15 p-2 text-brand-bright">
            <Swords className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Daily Duel</h3>
            <p className="mt-0.5 text-sm text-muted">
              {communityId
                ? "The circle's pick. Who finishes the US session higher."
                : "Tap who you think finishes the US session higher. Locks until 4pm ET."}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-[5.5rem] rounded-2xl border border-border bg-raised" />
          <div className="h-[5.5rem] rounded-2xl border border-border bg-raised" />
        </div>
      </section>
    );
  }

  function pick(choice: DuelPick) {
    if (communityId) {
      if (community?.myPick) return;
      const previous = community;
      const optimistic: CommunityDuel = previous
        ? {
            ...previous,
            myPick: choice,
            pickCount: previous.pickCount + 1,
            counts: {
              ...previous.counts,
              [choice]: previous.counts[choice] + 1,
            },
          }
        : {
            dayKey,
            pair,
            myPick: choice,
            counts: { a: choice === "a" ? 1 : 0, b: choice === "b" ? 1 : 0 },
            settled: false,
            pickCount: 1,
          };
      commitCommunity(optimistic);
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
          if (data) commitCommunity(data);
        })
        .catch(() => {
          if (previous) commitCommunity(previous);
          else setCommunity(null);
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
        "overview-fade min-h-[13.5rem] rounded-2xl border border-brand/25 bg-brand/[0.06] p-4",
        !compact && "sm:p-6"
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-brand/15 p-2 text-brand-bright">
            <Swords className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Daily Duel</h3>
            <p className="mt-0.5 text-sm text-muted">
              {communityId
                ? "The circle's pick. Who finishes the US session higher."
                : "Tap who you think finishes the US session higher. Locks until 4pm ET."}
            </p>
          </div>
        </div>
        {communityId && (community?.pickCount ?? 0) > 0 ? (
          <p className="shrink-0 text-sm text-muted">
            <span className="font-semibold tabular-nums text-foreground">
              {community?.pickCount ?? 0}
            </span>
            {(community?.pickCount ?? 0) === 1 ? " pick" : " picks"}
          </p>
        ) : (
          !communityId &&
          stats.totalPlayed > 0 && (
            <div className="rounded-xl border border-border bg-raised px-3 py-2 text-right">
              <p className="text-sm text-muted">
                Record
              </p>
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {stats.totalCorrect}/{stats.totalPlayed}
                <span className="ml-1.5 font-normal text-muted">
                  ({percent(stats.accuracyPct ?? 0, 0)})
                </span>
              </p>
              {stats.currentStreak >= 2 && (
                <p className="text-sm text-caution">
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
                "touch-target flex h-full flex-col items-center justify-center rounded-2xl border px-4 py-5 text-center transition",
                myPick == null
                  ? "border-border bg-raised hover:border-brand hover:bg-brand/10 active:scale-[0.98]"
                  : win
                    ? "border-gain/50 bg-gain/10"
                    : waitingOnClose && isPick
                      ? "border-brand/40 bg-brand/10"
                      : "border-border bg-raised opacity-70",
                isPick && "ring-2 ring-brand/60"
              )}
            >
              <p className="text-2xl font-semibold text-foreground">
                {cashtag(ticker)}
              </p>
              {isPick && (
                <p className="mt-1 text-sm font-medium text-brand-bright">
                  Your pick
                </p>
              )}
              {communityId &&
                community?.settled &&
                (community?.counts[side] ?? 0) > 0 && (
                <p className="mt-1 text-sm text-muted">
                  {community.counts[side]} vote
                  {community.counts[side] === 1 ? "" : "s"}
                </p>
              )}
              {waitingOnClose && isPick && !communityId && (
                <p className="mt-2 text-sm text-muted">Locked · no peek</p>
              )}
              {waitingOnClose && !isPick && !communityId && (
                <p className="mt-2 text-sm text-muted">—</p>
              )}
              {pct != null && (
                <p
                  className={cn(
                    "mt-2 text-lg font-semibold tabular-nums",
                    pct > 0
                      ? "text-gain"
                      : pct < 0
                        ? "text-loss"
                        : "text-muted"
                  )}
                >
                  {percent(pct)}
                </p>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-center text-sm leading-relaxed text-muted">
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
