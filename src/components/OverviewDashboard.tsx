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
  if (value > 0) return "text-gain";
  if (value < 0) return "text-loss";
  return "text-zinc-400";
}

function PortfolioChips({ names }: { names: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <span
          key={name}
          className="rounded-md bg-zinc-800/90 px-2 py-0.5 text-sm text-zinc-300"
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
        "group flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition hover:brightness-110",
        isUp
          ? "border-emerald-500/25 bg-emerald-500/[0.07]"
          : "border-rose-500/25 bg-rose-500/[0.07]"
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums",
          isUp
            ? "bg-emerald-500/20 text-emerald-300"
            : "bg-rose-500/20 text-rose-300"
        )}
      >
        {rank}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-lg font-semibold text-white">{ticker.ticker}</span>
          <span className="text-sm text-zinc-400">
            {currency(ticker.currentValue, 0)}
          </span>
        </div>
        <PortfolioChips names={ticker.portfolios} />
        <div className="flex items-center gap-2.5 text-sm text-zinc-500">
          <span>{ticker.shares.toLocaleString("en-US")} sh</span>
          <Sparkline points={ticker.sparkline} width={64} height={18} />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={cn("text-xl font-bold tabular-nums", tone(metric))}>
          {percent(metric)}
        </div>
        <div className={cn("text-sm tabular-nums", tone(dollar))}>
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
      <div className="mb-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-white group-hover:text-brand-bright">
            {sheet.portfolio.name}
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {sheet.holdingCount} names · cash{" "}
            {currency(sheet.portfolio.cash_balance, 0)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold tabular-nums text-zinc-100">
            {currency(sheet.totalValue, 0)}
          </p>
          <p className={cn("mt-1 text-sm tabular-nums", tone(sheet.roiPct))}>
            {percent(sheet.roiPct)} · {signedCurrency(sheet.roiDollar)}
          </p>
        </div>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-zinc-800/80">
        <div
          className={cn(
            "overview-bar h-full rounded-full",
            hot
              ? "bg-gradient-to-r from-emerald-700 via-emerald-500 to-emerald-300"
              : "bg-gradient-to-r from-rose-700 via-rose-500 to-orange-400"
          )}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-sm text-zinc-500">
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
    <div className="space-y-8">
      <section className="overview-fade relative overflow-hidden rounded-3xl border border-brand-deep/30 bg-[#161618]/80 p-6 sm:p-7">
        <div
          className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-brand/12 blur-3xl"
          aria-hidden
        />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand/90">
              All portfolios · live glance
            </p>
            <h2 className="mt-1 text-[1.75rem] font-semibold tracking-tight text-white sm:text-3xl">
              Command center
            </h2>
            <p className="mt-2 text-base text-zinc-400">
              {totals.sheetCount} portfolios · {totals.uniqueTickers} tickers ·{" "}
              {totals.positionCount} positions
            </p>
          </div>
          <div
            className={cn(
              "overview-pulse rounded-2xl border px-5 py-3.5",
              dayUp
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-rose-500/30 bg-rose-500/10"
            )}
          >
            <div className="flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-zinc-400">
              <Zap
                className={cn(
                  "h-4 w-4",
                  dayUp ? "text-gain" : "text-loss"
                )}
              />
              Today
            </div>
            <p
              className={cn(
                "mt-1 text-[1.75rem] font-bold tabular-nums",
                tone(totals.todayDollar)
              )}
            >
              {signedCurrency(totals.todayDollar)}
            </p>
            <p className={cn("text-base tabular-nums", tone(totals.todayPct ?? 0))}>
              {totals.todayPct !== null ? percent(totals.todayPct) : "—"}
            </p>
          </div>
        </div>

        <div className="relative mt-6 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
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
              className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-4"
            >
              <p className="text-sm uppercase tracking-wide text-zinc-500">
                {stat.label}
              </p>
              <p
                className={cn(
                  "mt-1.5 text-2xl font-semibold tabular-nums text-white",
                  "tone" in stat && typeof stat.tone === "number"
                    ? tone(stat.tone)
                    : undefined
                )}
              >
                {stat.value}
              </p>
              <p
                className={cn(
                  "mt-1 text-sm text-zinc-400",
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

      <section className="overview-fade rounded-3xl border border-brand-deep/30 bg-[#161618]/70 p-6 sm:p-7">
        <div className="mb-5">
          <h3 className="text-xl font-semibold text-white">Portfolios</h3>
          <p className="mt-1 text-base text-zinc-400">
            Bar = book size · color = lifetime ROI
          </p>
        </div>
        <div className="space-y-6">
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

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="overview-fade rounded-3xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/5 to-[#161618]/40 p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="rounded-xl bg-emerald-500/15 p-2 text-gain">
              <Flame className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-semibold text-white">Winners</h3>
              <p className="text-sm text-zinc-400">Best lifetime ROI</p>
            </div>
            <TrendingUp className="ml-auto h-4 w-4 text-gain" />
          </div>
          <div className="space-y-3">
            {winners.length === 0 ? (
              <p className="py-5 text-center text-base text-zinc-500">
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

        <div className="overview-fade rounded-3xl border border-rose-500/20 bg-gradient-to-b from-rose-500/5 to-[#161618]/40 p-6">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="rounded-xl bg-rose-500/15 p-2 text-rose-400">
              <Snowflake className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-semibold text-white">Losers</h3>
              <p className="text-sm text-zinc-400">Deepest drawdowns</p>
            </div>
            <TrendingDown className="ml-auto h-4 w-4 text-rose-400" />
          </div>
          <div className="space-y-3">
            {losers.length === 0 ? (
              <p className="py-5 text-center text-base text-zinc-500">
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

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="overview-fade rounded-3xl border border-brand-deep/30 bg-[#161618]/70 p-6">
          <h3 className="text-xl font-semibold text-white">
            Today&apos;s gainzzz
          </h3>
          <p className="mb-5 mt-1 text-base text-zinc-400">Session gainers</p>
          <div className="space-y-3">
            {todayWinners.length === 0 ? (
              <p className="text-base text-zinc-500">Waiting on quotes…</p>
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
        <div className="overview-fade rounded-3xl border border-brand-deep/30 bg-[#161618]/70 p-6">
          <h3 className="text-xl font-semibold text-white">
            Today&apos;s stinkies
          </h3>
          <p className="mb-5 mt-1 text-base text-zinc-400">Session laggards</p>
          <div className="space-y-3">
            {todayLosers.length === 0 ? (
              <p className="text-base text-zinc-500">Waiting on quotes…</p>
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

      <section className="overview-fade rounded-3xl border border-brand-deep/30 bg-[#161618]/70 p-6 sm:p-7">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="rounded-xl bg-amber-500/15 p-2 text-amber-300">
            <Trophy className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-white">Top 10 holdings</h3>
            <p className="mt-1 text-base text-zinc-400">
              Combined value across portfolios
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {topHoldings.map((t, i) => (
            <button
              key={t.ticker}
              type="button"
              onClick={() => openFirstPortfolio(t)}
              className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 px-4 py-3.5 text-left transition hover:border-zinc-600 sm:flex-nowrap"
            >
              <span className="w-6 text-base tabular-nums text-zinc-500">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-lg font-semibold text-white">
                    {t.ticker}
                  </span>
                  <span className="text-sm text-zinc-400">
                    {t.shares.toLocaleString("en-US")} sh · {currency(t.price)}
                  </span>
                </div>
                <PortfolioChips names={t.portfolios} />
              </div>
              <div className="ml-auto text-right">
                <p className="text-lg font-semibold tabular-nums text-zinc-100">
                  {currency(t.currentValue, 0)}
                </p>
                <p className={cn("mt-0.5 text-sm tabular-nums", tone(t.roiPct))}>
                  {percent(t.roiPct)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="overview-fade rounded-3xl border border-brand-deep/30 bg-[#161618]/70 p-6 sm:p-7">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="rounded-xl bg-violet-500/15 p-2 text-violet-300">
            <CalendarDays className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-white">
              Upcoming earnings
            </h3>
            <p className="mt-1 text-base text-zinc-400">
              Soonest first · next 90 days
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {earnings === null ? (
            <p className="text-base text-zinc-500">Loading…</p>
          ) : earnings.length === 0 ? (
            <p className="text-base text-zinc-500">
              No earnings dates in the next 90 days.
            </p>
          ) : (
            [...earnings]
              .sort((a, b) => a.days - b.days || a.ticker.localeCompare(b.ticker))
              .map((e, index) => {
                const owned = tickers.find((t) => t.ticker === e.ticker);
                const soon = e.days <= 7;
                const when =
                  e.days === 0
                    ? "Today"
                    : e.days === 1
                      ? "Tomorrow"
                      : e.days <= 7
                        ? `In ${e.days} days`
                        : `In ${e.days} days`;
                return (
                  <div
                    key={e.ticker}
                    className={cn(
                      "rounded-2xl border px-4 py-3.5",
                      soon
                        ? "border-amber-500/30 bg-amber-500/[0.07]"
                        : "border-zinc-800/80 bg-zinc-900/30"
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-sm tabular-nums text-zinc-500">
                            #{index + 1}
                          </span>
                          <span className="text-lg font-semibold text-white">
                            {e.ticker}
                          </span>
                          {soon && (
                            <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-sm font-medium text-amber-200">
                              Soon
                            </span>
                          )}
                        </div>
                        {owned && <PortfolioChips names={owned.portfolios} />}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-medium tabular-nums text-zinc-100">
                          {when}
                        </p>
                        <p className="mt-0.5 text-sm tabular-nums text-zinc-500">
                          {e.date}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </section>

      <section className="overview-fade rounded-3xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-[#161618]/40 to-[#161618]/40 p-6 sm:p-7">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="rounded-xl bg-amber-500/15 p-2 text-amber-300">
            <Lightbulb className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-white">Fun facts</h3>
            <p className="mt-1 text-base text-zinc-400">From the live books</p>
          </div>
        </div>
        <ul className="space-y-3">
          {funFacts.length === 0 ? (
            <li className="text-base text-zinc-500">Waiting on quotes…</li>
          ) : (
            funFacts.map((fact) => (
              <li
                key={fact}
                className="rounded-2xl border border-zinc-800/70 bg-zinc-950/50 px-4 py-3.5 text-base leading-relaxed text-zinc-200"
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
