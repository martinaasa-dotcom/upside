"use client";

import { Sparkline } from "@/components/Sparkline";
import {
  currency,
  percent,
  signedCurrency,
  cn,
} from "@/lib/format";
import type { OverviewModel, PositionScore, SheetScore } from "@/lib/overview";
import { Flame, Snowflake, TrendingDown, TrendingUp, Zap } from "lucide-react";

type Props = {
  model: OverviewModel;
  onOpenSheet: (portfolioId: string) => void;
};

function tone(value: number) {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-rose-400";
  return "text-zinc-400";
}

function RankCard({
  rank,
  position,
  mode,
  onOpen,
}: {
  rank: number;
  position: PositionScore;
  mode: "win" | "loss" | "today-win" | "today-loss";
  onOpen: () => void;
}) {
  const isUp = mode === "win" || mode === "today-win";
  const metric =
    mode === "win" || mode === "loss"
      ? position.roiPct
      : (position.todayPct ?? 0);
  const dollar =
    mode === "win" || mode === "loss"
      ? position.roiDollar
      : position.todayDollar;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border px-3 py-3 text-left transition",
        "hover:-translate-y-0.5 hover:shadow-lg",
        isUp
          ? "border-emerald-500/25 bg-gradient-to-r from-emerald-500/10 via-zinc-900/40 to-transparent hover:border-emerald-400/50 hover:shadow-emerald-500/10"
          : "border-rose-500/25 bg-gradient-to-r from-rose-500/10 via-zinc-900/40 to-transparent hover:border-rose-400/50 hover:shadow-rose-500/10"
      )}
      style={{ animationDelay: `${rank * 70}ms` }}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums",
          isUp
            ? "bg-emerald-500/20 text-emerald-300"
            : "bg-rose-500/20 text-rose-300"
        )}
      >
        {rank}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-base font-semibold text-white">
            {position.ticker}
          </span>
          <span className="truncate text-[11px] text-zinc-500">
            {position.portfolioName}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
          <span>{currency(position.currentValue, 0)}</span>
          <Sparkline
            points={position.quote?.sparkline ?? []}
            width={64}
            height={18}
          />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={cn("text-lg font-bold tabular-nums", tone(metric))}>
          {percent(metric)}
        </div>
        <div className={cn("text-[11px] tabular-nums", tone(dollar))}>
          {signedCurrency(dollar)}
        </div>
      </div>
    </button>
  );
}

function SheetLane({
  sheet,
  maxValue,
  index,
  onOpen,
}: {
  sheet: SheetScore;
  maxValue: number;
  index: number;
  onOpen: () => void;
}) {
  const width =
    maxValue > 0
      ? Math.max(8, (sheet.totalValue / maxValue) * 100)
      : 8;
  const hot = sheet.roiPct >= 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full text-left"
      style={{ animationDelay: `${120 + index * 80}ms` }}
    >
      <div className="mb-1.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white group-hover:text-emerald-300">
            {sheet.portfolio.name}
          </p>
          <p className="text-[11px] text-zinc-500">
            {sheet.holdingCount} names · cash {currency(sheet.portfolio.cash_balance, 0)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-zinc-100">
            {currency(sheet.totalValue, 0)}
          </p>
          <p className={cn("text-[11px] tabular-nums", tone(sheet.roiPct))}>
            {percent(sheet.roiPct)} · {signedCurrency(sheet.roiDollar)}
          </p>
        </div>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-zinc-800/80">
        <div
          className={cn(
            "overview-bar h-full rounded-full transition-all duration-700",
            hot
              ? "bg-gradient-to-r from-emerald-600 via-emerald-400 to-lime-300"
              : "bg-gradient-to-r from-rose-700 via-rose-500 to-orange-400"
          )}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
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
  const { totals, sheets, winners, losers, todayWinners, todayLosers, positions } =
    model;
  const maxSheet = Math.max(...sheets.map((s) => s.totalValue), 1);
  const topHeavy = positions.slice(0, 8);
  const dayUp = (totals.todayDollar ?? 0) >= 0;

  return (
    <div className="space-y-6">
      {/* Hero scoreboard */}
      <section className="overview-fade relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-950/60 p-5 sm:p-7">
        <div
          className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-emerald-500/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl"
          aria-hidden
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-px",
            dayUp
              ? "bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
              : "bg-gradient-to-r from-transparent via-rose-400/60 to-transparent"
          )}
          aria-hidden
        />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-400/90">
              All sheets · live glance
            </p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Command center
            </h2>
            <p className="mt-2 max-w-md text-sm text-zinc-400">
              {totals.sheetCount} books · {totals.positionCount} positions · tap
              any name to jump into that sheet.
            </p>
          </div>
          <div
            className={cn(
              "overview-pulse rounded-2xl border px-4 py-3",
              dayUp
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-rose-500/30 bg-rose-500/10"
            )}
          >
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              <Zap className={cn("h-3.5 w-3.5", dayUp ? "text-emerald-400" : "text-rose-400")} />
              Today
            </div>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", tone(totals.todayDollar))}>
              {signedCurrency(totals.todayDollar)}
            </p>
            <p className={cn("text-sm tabular-nums", tone(totals.todayPct ?? 0))}>
              {totals.todayPct !== null ? percent(totals.todayPct) : "—"}
            </p>
          </div>
        </div>

        <div className="relative mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              label: "Cash across books",
              value: currency(totals.cash, 0),
              sub: totals.cash < 0 ? "Net margin / debt" : "Dry powder",
            },
            {
              label: "Cost basis",
              value: currency(totals.buyValue, 0),
              sub: "All equity cost",
            },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className="overview-fade rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3"
              style={{ animationDelay: `${80 + i * 60}ms` }}
            >
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                {stat.label}
              </p>
              <p
                className={cn(
                  "mt-1 text-xl font-semibold tabular-nums text-white",
                  "tone" in stat && typeof stat.tone === "number"
                    ? tone(stat.tone)
                    : undefined
                )}
              >
                {stat.value}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-xs text-zinc-500",
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

      {/* Sheet race */}
      <section className="overview-fade rounded-3xl border border-zinc-800/80 bg-zinc-950/40 p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Sheet race</h3>
            <p className="text-xs text-zinc-500">
              Bar length = book size. Color = lifetime ROI heat.
            </p>
          </div>
        </div>
        <div className="space-y-4">
          {sheets.map((sheet, i) => (
            <div key={sheet.portfolio.id} className="overview-fade">
              <SheetLane
                sheet={sheet}
                maxValue={maxSheet}
                index={i}
                onOpen={() => onOpenSheet(sheet.portfolio.id)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Winners / losers */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="overview-fade rounded-3xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/5 to-zinc-950/40 p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-xl bg-emerald-500/15 p-2 text-emerald-400">
              <Flame className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Winners</h3>
              <p className="text-xs text-zinc-500">Best lifetime ROI across books</p>
            </div>
            <TrendingUp className="ml-auto h-4 w-4 text-emerald-400" />
          </div>
          <div className="space-y-2">
            {winners.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-800 px-3 py-6 text-center text-sm text-zinc-500">
                No green names yet — hang in there.
              </p>
            ) : (
              winners.map((p, i) => (
                <div key={`${p.portfolioId}-${p.ticker}`} className="overview-fade">
                  <RankCard
                    rank={i + 1}
                    position={p}
                    mode="win"
                    onOpen={() => onOpenSheet(p.portfolioId)}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="overview-fade rounded-3xl border border-rose-500/20 bg-gradient-to-b from-rose-500/5 to-zinc-950/40 p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-xl bg-rose-500/15 p-2 text-rose-400">
              <Snowflake className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Losers</h3>
              <p className="text-xs text-zinc-500">Deepest drawdowns — worth a look</p>
            </div>
            <TrendingDown className="ml-auto h-4 w-4 text-rose-400" />
          </div>
          <div className="space-y-2">
            {losers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-800 px-3 py-6 text-center text-sm text-zinc-500">
                Nobody underwater. Smooth sailing.
              </p>
            ) : (
              losers.map((p, i) => (
                <div key={`${p.portfolioId}-${p.ticker}`} className="overview-fade">
                  <RankCard
                    rank={i + 1}
                    position={p}
                    mode="loss"
                    onOpen={() => onOpenSheet(p.portfolioId)}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Today movers */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="overview-fade rounded-3xl border border-zinc-800/80 bg-zinc-950/40 p-5">
          <h3 className="mb-1 text-base font-semibold text-white">
            Today&apos;s rockets
          </h3>
          <p className="mb-4 text-xs text-zinc-500">Session gainers</p>
          <div className="space-y-2">
            {todayWinners.length === 0 ? (
              <p className="text-sm text-zinc-500">Waiting on live quotes…</p>
            ) : (
              todayWinners.map((p, i) => (
                <RankCard
                  key={`tw-${p.portfolioId}-${p.ticker}`}
                  rank={i + 1}
                  position={p}
                  mode="today-win"
                  onOpen={() => onOpenSheet(p.portfolioId)}
                />
              ))
            )}
          </div>
        </div>
        <div className="overview-fade rounded-3xl border border-zinc-800/80 bg-zinc-950/40 p-5">
          <h3 className="mb-1 text-base font-semibold text-white">
            Today&apos;s sinks
          </h3>
          <p className="mb-4 text-xs text-zinc-500">Session laggards</p>
          <div className="space-y-2">
            {todayLosers.length === 0 ? (
              <p className="text-sm text-zinc-500">Waiting on live quotes…</p>
            ) : (
              todayLosers.map((p, i) => (
                <RankCard
                  key={`tl-${p.portfolioId}-${p.ticker}`}
                  rank={i + 1}
                  position={p}
                  mode="today-loss"
                  onOpen={() => onOpenSheet(p.portfolioId)}
                />
              ))
            )}
          </div>
        </div>
      </section>

      {/* Biggest positions */}
      <section className="overview-fade rounded-3xl border border-zinc-800/80 bg-zinc-950/40 p-5 sm:p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">Heavyweights</h3>
          <p className="text-xs text-zinc-500">
            Largest positions by market value across every sheet
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {topHeavy.map((p, i) => (
            <button
              key={`hw-${p.portfolioId}-${p.id}`}
              type="button"
              onClick={() => onOpenSheet(p.portfolioId)}
              className="flex items-center gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 px-3 py-2.5 text-left transition hover:border-zinc-600 hover:bg-zinc-900/60"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="w-5 text-xs tabular-nums text-zinc-600">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-white">{p.ticker}</span>
                  <span className="truncate text-[11px] text-zinc-500">
                    {p.portfolioName}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500">
                  {p.shares} sh · {currency(p.quote?.price ?? p.buy_price)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium tabular-nums text-zinc-100">
                  {currency(p.currentValue, 0)}
                </p>
                <p className={cn("text-[11px] tabular-nums", tone(p.roiPct))}>
                  {percent(p.roiPct)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
