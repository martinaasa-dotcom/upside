"use client";

import { Sparkline } from "@/components/Sparkline";
import {
  currency,
  percent,
  signedCurrency,
  cn,
} from "@/lib/format";
import type { OverviewModel, SheetScore, TickerScore } from "@/lib/overview";
import {
  CalendarDays,
  Flame,
  Lightbulb,
  Snowflake,
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

type EarningsEvent = { ticker: string; date: string; days: number };

type Props = {
  model: OverviewModel;
  onOpenSheet: (portfolioId: string) => void;
};

function tone(value: number) {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-rose-400";
  return "text-zinc-400";
}

function PortfolioChips({ names }: { names: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((name) => (
        <span
          key={name}
          className="rounded bg-zinc-800/90 px-1.5 py-px text-[12px] leading-5 text-zinc-300"
        >
          {name}
        </span>
      ))}
    </div>
  );
}

function RankCard({
  rank,
  ticker,
  mode,
  onOpen,
}: {
  rank: number;
  ticker: TickerScore;
  mode: "win" | "loss" | "today-win" | "today-loss";
  onOpen: () => void;
}) {
  const isUp = mode === "win" || mode === "today-win";
  const metric =
    mode === "win" || mode === "loss" ? ticker.roiPct : (ticker.todayPct ?? 0);
  const dollar =
    mode === "win" || mode === "loss" ? ticker.roiDollar : ticker.todayDollar;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition hover:brightness-110",
        isUp
          ? "border-emerald-500/20 bg-emerald-500/[0.06]"
          : "border-rose-500/20 bg-rose-500/[0.06]"
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums",
          isUp
            ? "bg-emerald-500/20 text-emerald-300"
            : "bg-rose-500/20 text-rose-300"
        )}
      >
        {rank}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-sm font-semibold text-white">{ticker.ticker}</span>
          <span className="text-[12px] text-zinc-500">
            {currency(ticker.currentValue, 0)}
          </span>
        </div>
        <PortfolioChips names={ticker.portfolios} />
        <div className="flex items-center gap-2 text-[12px] text-zinc-500">
          <span>{ticker.shares.toLocaleString("en-US")} sh</span>
          <Sparkline points={ticker.sparkline} width={56} height={14} />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={cn("text-sm font-bold tabular-nums", tone(metric))}>
          {percent(metric)}
        </div>
        <div className={cn("text-[12px] tabular-nums", tone(dollar))}>
          {signedCurrency(dollar)}
        </div>
      </div>
    </button>
  );
}

function PortfolioLane({
  sheet,
  maxValue,
  onOpen,
}: {
  sheet: SheetScore;
  maxValue: number;
  onOpen: () => void;
}) {
  const width =
    maxValue > 0 ? Math.max(8, (sheet.totalValue / maxValue) * 100) : 8;
  const hot = sheet.roiPct >= 0;

  return (
    <button type="button" onClick={onOpen} className="group w-full text-left">
      <div className="mb-1 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white group-hover:text-emerald-300">
            {sheet.portfolio.name}
          </p>
          <p className="text-[12px] text-zinc-500">
            {sheet.holdingCount} names · cash{" "}
            {currency(sheet.portfolio.cash_balance, 0)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-zinc-100">
            {currency(sheet.totalValue, 0)}
          </p>
          <p className={cn("text-[12px] tabular-nums", tone(sheet.roiPct))}>
            {percent(sheet.roiPct)} · {signedCurrency(sheet.roiDollar)}
          </p>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800/80">
        <div
          className={cn(
            "overview-bar h-full rounded-full",
            hot
              ? "bg-gradient-to-r from-emerald-600 via-emerald-400 to-lime-300"
              : "bg-gradient-to-r from-rose-700 via-rose-500 to-orange-400"
          )}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[12px] text-zinc-500">
        <span>
          Today{" "}
          <span className={tone(sheet.todayDollar)}>
            {signedCurrency(sheet.todayDollar)}
          </span>
        </span>
        <span className={tone(sheet.todayPct ?? 0)}>
          {sheet.todayPct !== null ? percent(sheet.todayPct) : "—"}
        </span>
      </div>
    </button>
  );
}

export function OverviewDashboard({ model, onOpenSheet }: Props) {
  const {
    totals,
    sheets,
    winners,
    losers,
    todayWinners,
    todayLosers,
    topHoldings,
    funFacts,
    tickers,
  } = model;
  const maxSheet = Math.max(...sheets.map((s) => s.totalValue), 1);
  const dayUp = (totals.todayDollar ?? 0) >= 0;
  const [earnings, setEarnings] = useState<EarningsEvent[] | null>(null);

  useEffect(() => {
    const list = tickers.map((t) => t.ticker);
    if (!list.length) return;
    let cancelled = false;
    void fetch(
      `/api/market/events?tickers=${encodeURIComponent(list.join(","))}`
    )
      .then((r) => r.json())
      .then((data: { earnings?: EarningsEvent[] }) => {
        if (!cancelled) setEarnings(data.earnings ?? []);
      })
      .catch(() => {
        if (!cancelled) setEarnings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tickers.map((t) => t.ticker).join(",")]);

  function openFirstPortfolio(t: TickerScore) {
    const id = t.portfolioIds[0];
    if (id) onOpenSheet(id);
  }

  return (
    <div className="space-y-4">
      <section className="overview-fade relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-4">
        <div
          className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl"
          aria-hidden
        />

        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-400/90">
              All portfolios · live glance
            </p>
            <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-white">
              Command center
            </h2>
            <p className="mt-1 text-[13px] text-zinc-400">
              {totals.sheetCount} portfolios · {totals.uniqueTickers} tickers ·{" "}
              {totals.positionCount} positions
            </p>
          </div>
          <div
            className={cn(
              "overview-pulse rounded-xl border px-3 py-2",
              dayUp
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-rose-500/30 bg-rose-500/10"
            )}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              <Zap
                className={cn(
                  "h-3 w-3",
                  dayUp ? "text-emerald-400" : "text-rose-400"
                )}
              />
              Today
            </div>
            <p
              className={cn(
                "mt-0.5 text-lg font-bold tabular-nums",
                tone(totals.todayDollar)
              )}
            >
              {signedCurrency(totals.todayDollar)}
            </p>
            <p className={cn("text-[13px] tabular-nums", tone(totals.todayPct ?? 0))}>
              {totals.todayPct !== null ? percent(totals.todayPct) : "—"}
            </p>
          </div>
        </div>

        <div className="relative mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Total value",
              value: currency(totals.totalValue, 0),
              sub: `Equity ${currency(totals.equityValue, 0)}`,
            },
            {
              label: "Unrealized P&L",
              value: signedCurrency(totals.roiDollar),
              sub: percent(totals.roiPct),
              tone: totals.roiDollar,
            },
            {
              label: "Cash",
              value: currency(totals.cash, 0),
              sub: totals.cash < 0 ? "Net margin / debt" : "Dry powder",
            },
            {
              label: "Cost basis",
              value: currency(totals.buyValue, 0),
              sub: "All equity cost",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2"
            >
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                {stat.label}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-base font-semibold tabular-nums text-white",
                  "tone" in stat && typeof stat.tone === "number"
                    ? tone(stat.tone)
                    : undefined
                )}
              >
                {stat.value}
              </p>
              <p
                className={cn(
                  "text-[12px] text-zinc-500",
                  "tone" in stat && typeof stat.tone === "number"
                    ? tone(stat.tone)
                    : undefined
                )}
              >
                {stat.sub}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="overview-fade rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-4">
        <div className="mb-3">
          <h3 className="text-base font-semibold text-white">Portfolios</h3>
          <p className="text-[12px] text-zinc-500">
            Bar = book size · color = lifetime ROI
          </p>
        </div>
        <div className="space-y-3">
          {sheets.map((sheet) => (
            <PortfolioLane
              key={sheet.portfolio.id}
              sheet={sheet}
              maxValue={maxSheet}
              onOpen={() => onOpenSheet(sheet.portfolio.id)}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="overview-fade rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/5 to-zinc-950/40 p-3.5">
          <div className="mb-2.5 flex items-center gap-2">
            <div className="rounded-lg bg-emerald-500/15 p-1.5 text-emerald-400">
              <Flame className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white">Winners</h3>
              <p className="text-[12px] text-zinc-500">Best lifetime ROI</p>
            </div>
            <TrendingUp className="ml-auto h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="space-y-1.5">
            {winners.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-zinc-500">
                No green names yet.
              </p>
            ) : (
              winners.map((t, i) => (
                <RankCard
                  key={t.ticker}
                  rank={i + 1}
                  ticker={t}
                  mode="win"
                  onOpen={() => openFirstPortfolio(t)}
                />
              ))
            )}
          </div>
        </div>

        <div className="overview-fade rounded-2xl border border-rose-500/20 bg-gradient-to-b from-rose-500/5 to-zinc-950/40 p-3.5">
          <div className="mb-2.5 flex items-center gap-2">
            <div className="rounded-lg bg-rose-500/15 p-1.5 text-rose-400">
              <Snowflake className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white">Losers</h3>
              <p className="text-[12px] text-zinc-500">Deepest drawdowns</p>
            </div>
            <TrendingDown className="ml-auto h-3.5 w-3.5 text-rose-400" />
          </div>
          <div className="space-y-1.5">
            {losers.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-zinc-500">
                Nobody underwater.
              </p>
            ) : (
              losers.map((t, i) => (
                <RankCard
                  key={t.ticker}
                  rank={i + 1}
                  ticker={t}
                  mode="loss"
                  onOpen={() => openFirstPortfolio(t)}
                />
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="overview-fade rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-3.5">
          <h3 className="text-base font-semibold text-white">
            Today&apos;s gainzzz
          </h3>
          <p className="mb-2.5 text-[12px] text-zinc-500">Session gainers</p>
          <div className="space-y-1.5">
            {todayWinners.length === 0 ? (
              <p className="text-[13px] text-zinc-500">Waiting on quotes…</p>
            ) : (
              todayWinners.map((t, i) => (
                <RankCard
                  key={`tg-${t.ticker}`}
                  rank={i + 1}
                  ticker={t}
                  mode="today-win"
                  onOpen={() => openFirstPortfolio(t)}
                />
              ))
            )}
          </div>
        </div>
        <div className="overview-fade rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-3.5">
          <h3 className="text-base font-semibold text-white">
            Today&apos;s stinkies
          </h3>
          <p className="mb-2.5 text-[12px] text-zinc-500">Session laggards</p>
          <div className="space-y-1.5">
            {todayLosers.length === 0 ? (
              <p className="text-[13px] text-zinc-500">Waiting on quotes…</p>
            ) : (
              todayLosers.map((t, i) => (
                <RankCard
                  key={`ts-${t.ticker}`}
                  rank={i + 1}
                  ticker={t}
                  mode="today-loss"
                  onOpen={() => openFirstPortfolio(t)}
                />
              ))
            )}
          </div>
        </div>
      </section>

      <section className="overview-fade rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-4">
        <div className="mb-2.5 flex items-center gap-2">
          <div className="rounded-lg bg-amber-500/15 p-1.5 text-amber-300">
            <Trophy className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Top 10 holdings</h3>
            <p className="text-[12px] text-zinc-500">
              Combined value across portfolios
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          {topHoldings.map((t, i) => (
            <button
              key={t.ticker}
              type="button"
              onClick={() => openFirstPortfolio(t)}
              className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-2.5 py-2 text-left transition hover:border-zinc-600 sm:flex-nowrap"
            >
              <span className="w-5 text-xs tabular-nums text-zinc-500">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="text-sm font-semibold text-white">
                    {t.ticker}
                  </span>
                  <span className="text-[12px] text-zinc-500">
                    {t.shares.toLocaleString("en-US")} sh · {currency(t.price)}
                  </span>
                </div>
                <PortfolioChips names={t.portfolios} />
              </div>
              <div className="ml-auto text-right">
                <p className="text-sm font-semibold tabular-nums text-zinc-100">
                  {currency(t.currentValue, 0)}
                </p>
                <p className={cn("text-[12px] tabular-nums", tone(t.roiPct))}>
                  {percent(t.roiPct)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="overview-fade rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-4">
        <div className="mb-2.5 flex items-center gap-2">
          <div className="rounded-lg bg-violet-500/15 p-1.5 text-violet-300">
            <CalendarDays className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">
              Upcoming earnings
            </h3>
            <p className="text-[12px] text-zinc-500">Owned tickers · next 90d</p>
          </div>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {earnings === null ? (
            <p className="text-[13px] text-zinc-500">Loading…</p>
          ) : earnings.length === 0 ? (
            <p className="text-[13px] text-zinc-500">
              No earnings dates in the next 90 days.
            </p>
          ) : (
            earnings.map((e) => {
              const owned = tickers.find((t) => t.ticker === e.ticker);
              return (
                <div
                  key={e.ticker}
                  className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-2.5 py-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{e.ticker}</p>
                    <p className="text-[13px] tabular-nums text-zinc-300">
                      {e.date}
                      <span className="ml-1.5 text-[12px] text-zinc-500">
                        {e.days === 0
                          ? "Today"
                          : e.days === 1
                            ? "Tomorrow"
                            : `${e.days}d`}
                      </span>
                    </p>
                  </div>
                  {owned && (
                    <div className="mt-1">
                      <PortfolioChips names={owned.portfolios} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="overview-fade rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-zinc-950/40 to-zinc-950/40 p-4">
        <div className="mb-2.5 flex items-center gap-2">
          <div className="rounded-lg bg-amber-500/15 p-1.5 text-amber-300">
            <Lightbulb className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Fun facts</h3>
            <p className="text-[12px] text-zinc-500">From the live books</p>
          </div>
        </div>
        <ul className="space-y-1.5">
          {funFacts.length === 0 ? (
            <li className="text-[13px] text-zinc-500">Waiting on quotes…</li>
          ) : (
            funFacts.map((fact) => (
              <li
                key={fact}
                className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-2.5 py-2 text-[13px] leading-snug text-zinc-200"
              >
                {fact}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
