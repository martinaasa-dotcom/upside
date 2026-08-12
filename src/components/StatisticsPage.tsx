"use client";

import { cn } from "@/lib/format";
import type { OverviewModel } from "@/lib/overview";
import {
  buildPortfolioStats,
  type PortfolioInsight,
  type PortfolioStatsModel,
} from "@/lib/portfolio-stats";
import type { CashflowEntry } from "@/lib/cashflow";
import type { VisitStreakState } from "@/lib/visit-streak";
import {
  MONTH_NAMES,
  MONTH_SHORT,
  type ActionSignal,
  type ActionStance,
  type CycleDayRow,
  type CycleMonthlyRow,
  type HourlyReturnRow,
  type SeasonalityModel,
} from "@/lib/market/seasonality";
import { ChevronLeft, ChevronRight, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_TICKERS = ["SPY", "^GSPC", "QQQ", "IWM", "DIA"];

type Props = {
  overview: OverviewModel;
  bookTickers?: string[];
  cashflows?: CashflowEntry[];
  visitStreak?: VisitStreakState | null;
};

function tileToneClass(tone?: "gain" | "loss" | "neutral" | "brand"): string {
  if (tone === "gain") return "text-gain";
  if (tone === "loss") return "text-loss";
  if (tone === "brand") return "text-brand-bright";
  return "text-white";
}

function insightTagClass(tag: PortfolioInsight["tag"]): string {
  if (tag === "performance") return "text-emerald-400/90";
  if (tag === "risk") return "text-amber-400/90";
  if (tag === "fun") return "text-brand-bright";
  if (tag === "habit") return "text-sky-400/90";
  return "text-zinc-400";
}

function insightTagLabel(tag: PortfolioInsight["tag"]): string {
  if (tag === "performance") return "Performance";
  if (tag === "risk") return "Risk";
  if (tag === "fun") return "Fun";
  if (tag === "habit") return "Habit";
  return "Structure";
}

function PortfolioStatsSection({ stats }: { stats: PortfolioStatsModel }) {
  if (!stats.hasBook) return null;

  return (
    <Section
      title="Your book"
      subtitle="Live stats from your sheets — concentration, rivalry, movers, and a few fun facts."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 px-3 py-3"
          >
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">
              {tile.label}
            </p>
            <p
              className={cn(
                "mt-1 text-lg font-semibold tabular-nums",
                tileToneClass(tile.tone)
              )}
            >
              {tile.value}
            </p>
            {tile.hint ? (
              <p className="mt-0.5 text-[11px] text-zinc-600">{tile.hint}</p>
            ) : null}
          </div>
        ))}
      </div>

      {stats.sheets.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wide text-zinc-600">
                <th className="pb-2 pr-3 font-medium">Sheet</th>
                <th className="pb-2 pr-3 font-medium">NAV</th>
                <th className="pb-2 pr-3 font-medium">Weight</th>
                <th className="pb-2 pr-3 font-medium">ROI</th>
                <th className="pb-2 font-medium">Today</th>
              </tr>
            </thead>
            <tbody>
              {stats.sheets.map((s) => (
                <tr key={s.id} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 text-zinc-200">
                    {s.name}
                    <span className="ml-1 text-[10px] text-zinc-600">
                      {s.holdings} pos
                    </span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-300">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    }).format(s.navUsd)}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-500">
                    {(s.weightPct * 100).toFixed(0)}%
                  </td>
                  <td
                    className={cn(
                      "py-2 pr-3 tabular-nums font-medium",
                      retText(s.roiPct * 100)
                    )}
                  >
                    {(s.roiPct * 100).toFixed(1)}%
                  </td>
                  <td
                    className={cn(
                      "py-2 tabular-nums",
                      retText((s.todayPct ?? 0) * 100)
                    )}
                  >
                    {s.todayPct != null
                      ? `${(s.todayPct * 100).toFixed(2)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {stats.topHoldings.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-400">
              Top holdings
            </p>
            <ul className="space-y-2">
              {stats.topHoldings.map((h) => (
                <li key={h.ticker}>
                  <div className="mb-0.5 flex justify-between text-xs">
                    <span className="font-medium text-zinc-200">
                      {h.ticker}
                    </span>
                    <span className="tabular-nums text-zinc-500">
                      {(h.pct * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-brand/70"
                      style={{ width: `${Math.min(100, h.pct * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {stats.topSectors.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-400">
              Sector mix
            </p>
            <ul className="space-y-2">
              {stats.topSectors.map((s) => (
                <li key={s.label}>
                  <div className="mb-0.5 flex justify-between text-xs">
                    <span className="text-zinc-300">{s.label}</span>
                    <span className="tabular-nums text-zinc-500">
                      {(s.pct * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-zinc-500"
                      style={{ width: `${Math.min(100, s.pct * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {stats.insights.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
            <Sparkles className="h-3.5 w-3.5 text-brand" aria-hidden />
            Insights & lore
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {stats.insights.map((insight) => (
              <div
                key={insight.id}
                className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5"
              >
                <p
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide",
                    insightTagClass(insight.tag)
                  )}
                >
                  {insightTagLabel(insight.tag)}
                </p>
                <p className="mt-1 text-sm font-medium text-zinc-100">
                  {insight.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                  {insight.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function retText(v: number): string {
  if (v > 0.05) return "text-gain";
  if (v < -0.05) return "text-loss";
  return "text-zinc-400";
}

function retBarColor(v: number): string {
  if (v > 0.05) return "bg-emerald-500";
  if (v < -0.05) return "bg-rose-500";
  return "bg-zinc-600";
}

function stanceStyles(stance: ActionStance): string {
  if (stance === "deploy") return "border-emerald-500/40 bg-emerald-950/30";
  if (stance === "raise_cash") return "border-amber-500/40 bg-amber-950/25";
  return "border-zinc-600/50 bg-zinc-900/50";
}

function stanceLabel(stance: ActionStance): string {
  if (stance === "deploy") return "Deploy cash";
  if (stance === "raise_cash") return "Raise cash";
  return "Hold / neutral";
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {subtitle ? (
        <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CycleMonthlyChart({
  rows,
  currentMonth,
  onSelectMonth,
}: {
  rows: CycleMonthlyRow[];
  currentMonth: number;
  onSelectMonth: (m: number) => void;
}) {
  const maxAbs = Math.max(
    ...rows.map((r) => Math.abs(r.avgMonthReturnPct)),
    0.5
  );

  return (
    <div className="flex items-end gap-1">
      {rows.map((row) => {
        const v = row.avgMonthReturnPct;
        const h = Math.max(6, (Math.abs(v) / maxAbs) * 100);
        const isCurrent = row.month === currentMonth;
        return (
          <button
            key={row.month}
            type="button"
            onClick={() => onSelectMonth(row.month)}
            className={cn(
              "group flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md px-0.5 py-1 transition",
              isCurrent && "bg-brand/15 ring-1 ring-brand/40"
            )}
            title={`${row.label}: avg ${v >= 0 ? "+" : ""}${v}% (${row.samples} prior ${row.label}s)`}
          >
            <div className="flex h-28 w-full items-end justify-center">
              <div
                className={cn(
                  "w-full max-w-[2.25rem] rounded-t transition group-hover:opacity-90",
                  retBarColor(v)
                )}
                style={{ height: `${h}%` }}
              />
            </div>
            <span
              className={cn(
                "text-[9px]",
                isCurrent ? "font-semibold text-brand-bright" : "text-zinc-500"
              )}
            >
              {row.label}
            </span>
            <span className={cn("text-[9px] tabular-nums", retText(v))}>
              {v >= 0 ? "+" : ""}
              {v.toFixed(1)}%
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MonthHistoryTable({ row }: { row: CycleMonthlyRow }) {
  if (row.history.length === 0) {
    return (
      <p className="text-xs text-zinc-600">No prior months in this cycle phase.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[16rem] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wide text-zinc-600">
            <th className="pb-1.5 pr-3 font-medium">Year</th>
            <th className="pb-1.5 font-medium">Month return</th>
          </tr>
        </thead>
        <tbody>
          {row.history.map((h) => (
            <tr key={h.year} className="border-b border-zinc-800/60">
              <td className="py-1.5 pr-3 tabular-nums text-zinc-400">{h.year}</td>
              <td
                className={cn(
                  "py-1.5 font-medium tabular-nums",
                  retText(h.returnPct)
                )}
              >
                {h.returnPct >= 0 ? "+" : ""}
                {h.returnPct.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DayOfMonthChart({
  rows,
  monthLabel,
  selectedDay,
  todayDay,
  onSelectDay,
}: {
  rows: CycleDayRow[];
  monthLabel: string;
  selectedDay: number;
  todayDay: number | null;
  onSelectDay: (day: number) => void;
}) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.avgReturnPct)), 0.05);

  return (
    <div className="space-y-3">
      <div className="relative flex items-center gap-0.5 overflow-x-auto rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-2 py-3">
        <div className="pointer-events-none absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-zinc-700/80" />
        {rows.map((row) => {
          const v = row.avgReturnPct;
          const h = Math.max(8, (Math.abs(v) / maxAbs) * 46);
          const isSelected = selectedDay === row.day;
          const isToday = todayDay === row.day;
          return (
            <button
              key={row.day}
              type="button"
              onClick={() => onSelectDay(row.day)}
              className={cn(
                "relative flex min-w-[1.5rem] flex-col items-center gap-1 rounded px-0.5 py-1 transition hover:bg-zinc-800/50",
                isSelected && "bg-brand/15 ring-1 ring-brand/40",
                isToday && !isSelected && "ring-1 ring-brand/25"
              )}
              title={`Day ${row.day}: ${v >= 0 ? "+" : ""}${v.toFixed(3)}% avg · ${row.winRate}% up · n=${row.samples}`}
            >
              <div className="relative flex h-48 w-full items-center justify-center">
                <div
                  className={cn(
                    "absolute w-full max-w-[1.1rem] rounded-sm",
                    retBarColor(v)
                  )}
                  style={{
                    height: `${h}%`,
                    ...(v >= 0
                      ? { bottom: "50%" }
                      : { top: "50%" }),
                  }}
                />
              </div>
              <span
                className={cn(
                  "text-[9px] tabular-nums",
                  isSelected || isToday
                    ? "font-bold text-brand-bright"
                    : "text-zinc-500"
                )}
              >
                {row.day}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-zinc-600">
        Click a day to see its hourly pattern below. Each bar = average full-session
        return on that calendar day in {monthLabel} (cycle-filtered).
      </p>
    </div>
  );
}

function HourlyReturnChart({
  rows,
  dayLabel,
}: {
  rows: HourlyReturnRow[];
  dayLabel: string;
}) {
  const withData = rows.filter((r) => r.samples > 0);
  if (withData.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Not enough hourly history for {dayLabel} in this cycle phase.
      </p>
    );
  }

  const maxAbs = Math.max(
    ...withData.map((r) => Math.abs(r.avgReturnPct)),
    0.01
  );
  const totalSamples = Math.max(...rows.map((r) => r.samples));

  return (
    <div className="space-y-3">
      <div className="relative flex items-center gap-2">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-zinc-700/80" />
        {rows.map((row) => {
          const v = row.avgReturnPct;
          const h = Math.max(6, (Math.abs(v) / maxAbs) * 48);
          return (
            <div
              key={row.hourEt}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
              title={`${row.label}: ${v >= 0 ? "+" : ""}${v.toFixed(3)}% avg · n=${row.samples}`}
            >
              <div className="relative flex h-40 w-full items-center justify-center">
                {row.samples > 0 ? (
                  <div
                    className={cn(
                      "absolute w-[70%] rounded-sm",
                      retBarColor(v)
                    )}
                    style={{
                      height: `${h}%`,
                      ...(v >= 0 ? { bottom: "50%" } : { top: "50%" }),
                    }}
                  />
                ) : null}
              </div>
              <span className="text-[9px] text-zinc-500">{row.label}</span>
              {row.samples > 0 && (
                <span className={cn("text-[9px] tabular-nums", retText(v))}>
                  {v >= 0 ? "+" : ""}
                  {v.toFixed(2)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-zinc-600">
        Average hourly return on {dayLabel} across {totalSamples} prior sessions
        in this cycle phase (10am–3pm ET).
      </p>
    </div>
  );
}

function ActionCards({ signals }: { signals: ActionSignal[] }) {
  if (signals.length === 0) return null;
  const s = signals[0]!;
  return (
    <div className={cn("rounded-xl border px-4 py-3", stanceStyles(s.stance))}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {stanceLabel(s.stance)} · this month
      </p>
      <p className="mt-1 text-sm font-medium text-white">{s.headline}</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">{s.detail}</p>
    </div>
  );
}

function todayInMarketTz(): { month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  return {
    month: Number(parts.find((p) => p.type === "month")?.value ?? 1),
    day: Number(parts.find((p) => p.type === "day")?.value ?? 1),
  };
}

export function StatisticsPage({
  overview,
  bookTickers = [],
  cashflows = [],
  visitStreak = null,
}: Props) {
  const portfolioStats = useMemo(
    () =>
      buildPortfolioStats({
        overview,
        cashflows,
        visitStreak,
      }),
    [overview, cashflows, visitStreak]
  );

  const tickers = useMemo(() => {
    const merged = [...DEFAULT_TICKERS];
    for (const t of bookTickers) {
      const u = t.toUpperCase();
      if (!merged.includes(u)) merged.push(u);
    }
    return merged;
  }, [bookTickers]);

  const marketToday = useMemo(() => todayInMarketTz(), []);

  const [ticker, setTicker] = useState("SPY");
  const [model, setModel] = useState<SeasonalityModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Monthly history panel — independent from day drill-down. */
  const [playbookMonth, setPlaybookMonth] = useState(marketToday.month);
  /** Day drill-down defaults to today and stays put unless you navigate. */
  const [viewMonth, setViewMonth] = useState(marketToday.month);
  const [selectedDay, setSelectedDay] = useState(marketToday.day);

  const load = useCallback(async (sym: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/market/seasonality?ticker=${encodeURIComponent(sym)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to load seasonality");
      }
      setModel((await res.json()) as SeasonalityModel);
    } catch (e) {
      setModel(null);
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(ticker);
  }, [ticker, load]);

  const playbookMonthRow = model?.cycleMonthly[playbookMonth - 1];
  const dayRows = model?.cycleDaysByMonth[String(viewMonth)] ?? [];
  const viewMonthName = MONTH_NAMES[viewMonth - 1] ?? "Month";
  const hourlyRows =
    model?.hourlyByCalendarDay[`${viewMonth}-${selectedDay}`] ?? [];
  const selectedDayLabel = `${viewMonthName} ${selectedDay}`;

  function shiftViewMonth(delta: number) {
    setViewMonth((m) => {
      let next = m + delta;
      if (next < 1) next = 12;
      if (next > 12) next = 1;
      return next;
    });
  }

  function goToToday() {
    setViewMonth(marketToday.month);
    setSelectedDay(marketToday.day);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Statistics</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Your book at a glance, plus market seasonality for timing entries.
          </p>
        </div>
      </div>

      <PortfolioStatsSection stats={portfolioStats} />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-zinc-800" />
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600">
          Market seasonality
        </p>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="text-[11px] text-zinc-500">
          Benchmark
          <select
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="ml-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-white outline-none focus:border-brand"
          >
            {tickers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load(ticker)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {loading && !model ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-12 text-center text-sm text-zinc-500">
          Loading seasonality for {ticker}…
        </div>
      ) : null}

      {model && (
        <>
          <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3">
            <p className="text-sm text-zinc-200">
              <span className="font-semibold text-white">{model.asOfYear}</span>
              {" · "}
              <span className="text-brand-bright">{model.currentCycleLabel} year</span>
              {" · "}
              {model.ticker} since {model.from.slice(0, 4)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              All monthly and daily patterns below use only history from prior{" "}
              {model.currentCycleLabel.toLowerCase()} years — same slot in the
              4-year presidential cycle as today.
            </p>
          </div>

          <ActionCards signals={model.signals} />

          <Section
            title="Monthly playbook (this cycle phase)"
            subtitle={`Total month return in each calendar month — historical ${model.currentCycleLabel.toLowerCase()} years only. Click a month to inspect its days.`}
          >
            <CycleMonthlyChart
              rows={model.cycleMonthly}
              currentMonth={model.asOfMonth}
              onSelectMonth={setPlaybookMonth}
            />
            {playbookMonthRow && (
              <div className="mt-5 rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-200">
                    {MONTH_NAMES[playbookMonth - 1]} history
                  </p>
                  <p className={cn("text-sm tabular-nums font-semibold", retText(playbookMonthRow.avgMonthReturnPct))}>
                    avg {playbookMonthRow.avgMonthReturnPct >= 0 ? "+" : ""}
                    {playbookMonthRow.avgMonthReturnPct}% ·{" "}
                    {playbookMonthRow.winRate}% win · n={playbookMonthRow.samples}
                  </p>
                </div>
                <div className="mt-3">
                  <MonthHistoryTable row={playbookMonthRow} />
                </div>
              </div>
            )}
          </Section>

          <Section
            title="Daily rhythm within the month"
            subtitle="Defaults to today. Click a day for its hourly pattern — independent from the monthly chart above."
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => shiftViewMonth(-1)}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <div className="text-center">
                <p className="text-sm font-semibold text-white">
                  {viewMonthName} {selectedDay}
                </p>
                {viewMonth === marketToday.month &&
                selectedDay === marketToday.day ? (
                  <p className="text-[10px] text-brand-bright">Today</p>
                ) : (
                  <button
                    type="button"
                    onClick={goToToday}
                    className="text-[10px] text-zinc-500 underline-offset-2 hover:text-brand-bright hover:underline"
                  >
                    Jump to today
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => shiftViewMonth(1)}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mb-3 flex flex-wrap gap-1">
              {MONTH_SHORT.map((label, idx) => {
                const m = idx + 1;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setViewMonth(m)}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium transition",
                      viewMonth === m
                        ? "bg-brand text-[#121214]"
                        : m === marketToday.month
                          ? "text-brand-bright ring-1 ring-brand/40 hover:bg-brand/15"
                          : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <DayOfMonthChart
              rows={dayRows}
              monthLabel={viewMonthName}
              selectedDay={selectedDay}
              todayDay={
                viewMonth === marketToday.month ? marketToday.day : null
              }
              onSelectDay={setSelectedDay}
            />
          </Section>

          <Section
            title={`Hourly pattern · ${selectedDayLabel}`}
            subtitle="Single average return per hour on this calendar day (cycle-filtered, regular session)."
          >
            <HourlyReturnChart rows={hourlyRows} dayLabel={selectedDayLabel} />
          </Section>
        </>
      )}
    </div>
  );
}
