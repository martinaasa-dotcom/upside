"use client";

import { cn, cashtag } from "@/lib/format";
import {
  MONTH_NAMES,
  MONTH_SHORT,
  type ActionSignal,
  type ActionStance,
  type CycleDayRow,
  type CycleMonthlyRow,
  type SeasonalityModel,
} from "@/lib/market/seasonality";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_TICKERS = ["SPY", "^GSPC", "QQQ", "IWM", "DIA"];

type Props = {
  /** Book tickers appended to the benchmark dropdown so you can check your
   * own names, not just the index. */
  bookTickers?: string[];
};

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
  if (stance === "deploy") return "Historically strong months";
  if (stance === "raise_cash") return "Historically soft months";
  return "Mixed / no seasonal edge";
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
    <section className="rounded-2xl border border-brand-deep/30 bg-card/80 p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {subtitle ? (
        <p className="mt-1 text-xs text-zinc-400">{subtitle}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CycleMonthlyChart({
  rows,
  selectedMonth,
  currentMonth,
  onSelectMonth,
}: {
  rows: CycleMonthlyRow[];
  /** The bar the user actually clicked — this is what should visibly glow. */
  selectedMonth: number;
  /** Today's real calendar month — a subtler ring when it isn't selected. */
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
        const isSelected = row.month === selectedMonth;
        const isCurrent = row.month === currentMonth;
        return (
          <button
            key={row.month}
            type="button"
            onClick={() => onSelectMonth(row.month)}
            aria-pressed={isSelected}
            className={cn(
              "group flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md px-0.5 py-1 transition",
              isSelected
                ? "bg-brand/25 ring-2 ring-brand shadow-[0_0_12px_0_rgba(197,160,89,0.45)]"
                : isCurrent
                  ? "ring-1 ring-brand/35 hover:bg-brand/10"
                  : "hover:bg-zinc-800/50"
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
                "text-xs",
                isSelected
                  ? "font-bold text-brand-bright"
                  : isCurrent
                    ? "font-semibold text-brand-bright/80"
                    : "text-zinc-400"
              )}
            >
              {row.label}
            </span>
            <span className={cn("text-xs tabular-nums", retText(v))}>
              {v >= 0 ? "+" : ""}
              {v.toFixed(1)}%
            </span>
          </button>
        );
      })}
    </div>
  );
}

function historyMedian(returns: number[]): number {
  const s = [...returns].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function CycleHistoryBars({
  history,
  highlightYear,
}: {
  history: Array<{ year: number; returnPct: number }>;
  highlightYear?: number;
}) {
  if (history.length === 0) {
    return (
      <p className="text-xs text-zinc-400">No prior data in this cycle phase.</p>
    );
  }

  const sorted = [...history].sort((a, b) => a.year - b.year);
  const maxAbs = Math.max(...sorted.map((h) => Math.abs(h.returnPct)), 0.5);
  const best = [...sorted].sort((a, b) => b.returnPct - a.returnPct)[0]!;
  const worst = [...sorted].sort((a, b) => a.returnPct - b.returnPct)[0]!;
  const median = historyMedian(sorted.map((h) => h.returnPct));
  const wins = sorted.filter((h) => h.returnPct > 0).length;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-md border border-zinc-800/80 bg-zinc-950/50 px-2 py-0.5 text-zinc-400">
          Best{" "}
          <span className={cn("font-semibold tabular-nums", retText(best.returnPct))}>
            {best.year} {best.returnPct >= 0 ? "+" : ""}
            {best.returnPct.toFixed(1)}%
          </span>
        </span>
        <span className="rounded-md border border-zinc-800/80 bg-zinc-950/50 px-2 py-0.5 text-zinc-400">
          Worst{" "}
          <span className={cn("font-semibold tabular-nums", retText(worst.returnPct))}>
            {worst.year} {worst.returnPct >= 0 ? "+" : ""}
            {worst.returnPct.toFixed(1)}%
          </span>
        </span>
        <span className="rounded-md border border-zinc-800/80 bg-zinc-950/50 px-2 py-0.5 text-zinc-400">
          Median{" "}
          <span className={cn("font-semibold tabular-nums", retText(median))}>
            {median >= 0 ? "+" : ""}
            {median.toFixed(1)}%
          </span>
        </span>
        <span className="rounded-md border border-zinc-800/80 bg-zinc-950/50 px-2 py-0.5 text-zinc-400">
          Range{" "}
          <span className="font-semibold tabular-nums text-zinc-300">
            {(best.returnPct - worst.returnPct).toFixed(1)}pp
          </span>
        </span>
        <span className="rounded-md border border-zinc-800/80 bg-zinc-950/50 px-2 py-0.5 text-zinc-400">
          {wins}/{sorted.length} green
        </span>
      </div>

      <div className="grid gap-0.5">
        {sorted.map((h) => {
          const barW = (Math.abs(h.returnPct) / maxAbs) * 50;
          const isHighlight = highlightYear === h.year;
          return (
            <div
              key={h.year}
              className={cn(
                "grid grid-cols-[2.25rem_minmax(0,1fr)_3.25rem] items-center gap-1.5 rounded px-0.5 py-px",
                isHighlight && "bg-brand/10 ring-1 ring-brand/25"
              )}
              title={`${h.year}: ${h.returnPct >= 0 ? "+" : ""}${h.returnPct.toFixed(2)}%`}
            >
              <span
                className={cn(
                  "text-xs tabular-nums",
                  isHighlight
                    ? "font-semibold text-brand-bright"
                    : "text-zinc-400"
                )}
              >
                {h.year}
              </span>
              <div className="relative h-2.5 overflow-hidden rounded-sm bg-zinc-800/70">
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-px bg-zinc-600/70" />
                <div
                  className={cn(
                    "absolute inset-y-0 rounded-sm opacity-90",
                    retBarColor(h.returnPct)
                  )}
                  style={
                    h.returnPct >= 0
                      ? { left: "50%", width: `${barW}%` }
                      : { right: "50%", width: `${barW}%` }
                  }
                />
              </div>
              <span
                className={cn(
                  "text-right text-xs font-medium tabular-nums",
                  retText(h.returnPct)
                )}
              >
                {h.returnPct >= 0 ? "+" : ""}
                {h.returnPct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthHistoryTable({
  row,
  highlightYear,
}: {
  row: CycleMonthlyRow;
  highlightYear?: number;
}) {
  return (
    <CycleHistoryBars history={row.history} highlightYear={highlightYear} />
  );
}

function DayHistoryTable({
  row,
  highlightYear,
}: {
  row: CycleDayRow;
  highlightYear?: number;
}) {
  return (
    <CycleHistoryBars history={row.history} highlightYear={highlightYear} />
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
      <div className="-mx-1 overflow-x-auto px-1">
      <div
        className="relative grid gap-px rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-2"
        style={{
          gridTemplateColumns: `repeat(${rows.length}, minmax(1.4rem, 1fr))`,
        }}
      >
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
              aria-pressed={isSelected}
              className={cn(
                "relative flex min-w-0 flex-col items-center gap-1 rounded px-0.5 py-1 transition hover:bg-zinc-800/50",
                isSelected
                  ? "bg-brand/25 ring-2 ring-brand shadow-[0_0_10px_0_rgba(197,160,89,0.4)]"
                  : isToday && "ring-1 ring-brand/30"
              )}
              title={`Day ${row.day}: ${v >= 0 ? "+" : ""}${v.toFixed(3)}% avg · ${row.winRate}% up · n=${row.samples}`}
            >
              <div className="relative flex h-48 w-full items-center justify-center">
                <div
                  className={cn(
                    "absolute w-[85%] max-w-full rounded-sm",
                    retBarColor(v),
                    row.samples === 0 && "opacity-30"
                  )}
                  style={{
                    height: `${h}%`,
                    ...(v >= 0 ? { bottom: "50%" } : { top: "50%" }),
                  }}
                />
              </div>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  isSelected || isToday
                    ? "font-bold text-brand-bright"
                    : "text-zinc-400"
                )}
              >
                {row.day}
              </span>
              <span
                className={cn(
                  "text-xs leading-none tabular-nums",
                  row.samples === 0 ? "text-zinc-400" : retText(v)
                )}
              >
                {row.samples === 0 ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}`}
              </span>
            </button>
          );
        })}
      </div>
      </div>
      <p className="text-xs text-zinc-400">
        Each bar = average session return on that calendar day in {monthLabel}{" "}
        (cycle-filtered). Click a day for year-by-year history. Swipe
        sideways on phone if the month has more days than fit.
      </p>
    </div>
  );
}

function ActionCards({ signals }: { signals: ActionSignal[] }) {
  if (signals.length === 0) return null;
  const s = signals[0]!;
  return (
    <div className={cn("rounded-xl border px-4 py-3", stanceStyles(s.stance))}>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
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

/**
 * Seasonality — presidential-cycle-aware historical timing patterns.
 * Deliberately doesn't repeat anything from Overview (current state) or Lab
 * (scenario tools). This page's one job is the historical calendar shape.
 * It does not tell you to add or trim.
 */
export function SeasonalityPage({ bookTickers = [] }: Props) {
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
  const selectedDayRow = dayRows.find((r) => r.day === selectedDay);
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
          <h2 className="text-lg font-semibold text-white">Seasonality</h2>
          <p className="mt-0.5 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Which months and days have historically been kind to the market,
            and which have not. Patterns from the past, nothing about your own
            holdings and no claim about what happens next.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-zinc-400">
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
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {loading && !model ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-12 text-center text-sm text-zinc-400">
          Loading seasonality for {cashtag(ticker)}…
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
              {cashtag(model.ticker)} since {model.from.slice(0, 4)}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              All monthly and daily patterns below use only history from prior{" "}
              {model.currentCycleLabel.toLowerCase()} years, same slot in the
              4-year presidential cycle as today.
            </p>
          </div>

          <ActionCards signals={model.signals} />

          <Section
            title="Monthly playbook (this cycle phase)"
            subtitle={`Total month return in each calendar month, historical ${model.currentCycleLabel.toLowerCase()} years only. Click a month to inspect its days.`}
          >
            <CycleMonthlyChart
              rows={model.cycleMonthly}
              selectedMonth={playbookMonth}
              currentMonth={model.asOfMonth}
              onSelectMonth={setPlaybookMonth}
            />
            {playbookMonthRow && (
              <div className="mt-4 rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-2.5">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-xs font-medium text-zinc-300">
                    {MONTH_NAMES[playbookMonth - 1]} in this cycle phase
                  </p>
                  <p
                    className={cn(
                      "text-xs tabular-nums font-semibold",
                      retText(playbookMonthRow.avgMonthReturnPct)
                    )}
                  >
                    avg {playbookMonthRow.avgMonthReturnPct >= 0 ? "+" : ""}
                    {playbookMonthRow.avgMonthReturnPct}% ·{" "}
                    {playbookMonthRow.winRate}% win · n=
                    {playbookMonthRow.samples}
                  </p>
                </div>
                <MonthHistoryTable
                  row={playbookMonthRow}
                  highlightYear={model.asOfYear}
                />
              </div>
            )}
          </Section>

          <Section
            title="Daily rhythm within the month"
            subtitle="Defaults to today. Click a day for its hourly pattern, independent from the monthly chart above."
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
                  <p className="text-xs text-brand-bright">Today</p>
                ) : (
                  <button
                    type="button"
                    onClick={goToToday}
                    className="text-xs text-zinc-400 underline-offset-2 hover:text-brand-bright hover:underline"
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
                      "rounded-md px-2 py-1 text-xs font-medium transition",
                      viewMonth === m
                        ? "bg-white text-black"
                        : m === marketToday.month
                          ? "text-brand-bright ring-1 ring-brand/40 hover:bg-brand/15"
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
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
            {selectedDayRow && (
              <div className="mt-4 rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-2.5">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-xs font-medium text-zinc-300">
                    {selectedDayLabel}, prior sessions
                  </p>
                  <p
                    className={cn(
                      "text-xs tabular-nums font-semibold",
                      retText(selectedDayRow.avgReturnPct)
                    )}
                  >
                    avg {selectedDayRow.avgReturnPct >= 0 ? "+" : ""}
                    {selectedDayRow.avgReturnPct}% · {selectedDayRow.winRate}%
                    win · n={selectedDayRow.samples}
                  </p>
                </div>
                <DayHistoryTable
                  row={selectedDayRow}
                  highlightYear={model.asOfYear}
                />
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
