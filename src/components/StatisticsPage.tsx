"use client";

import { cn } from "@/lib/format";
import {
  MONTH_NAMES,
  MONTH_SHORT,
  type ActionSignal,
  type ActionStance,
  type CycleDayRow,
  type CycleMonthlyRow,
  type IntradayBucketRow,
  type SeasonalityModel,
} from "@/lib/market/seasonality";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_TICKERS = ["SPY", "^GSPC", "QQQ", "IWM", "DIA"];

type Props = {
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
  todayDay,
}: {
  rows: CycleDayRow[];
  monthLabel: string;
  todayDay: number | null;
}) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.avgReturnPct)), 0.05);

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-0.5 overflow-x-auto pb-1">
        {rows.map((row) => {
          const v = row.avgReturnPct;
          const h = Math.max(4, (Math.abs(v) / maxAbs) * 100);
          const isToday = todayDay === row.day;
          return (
            <div
              key={row.day}
              className={cn(
                "flex min-w-[1.35rem] flex-col items-center gap-0.5",
                isToday && "rounded bg-brand/15 px-0.5 ring-1 ring-brand/35"
              )}
              title={`Day ${row.day}: ${v >= 0 ? "+" : ""}${v.toFixed(3)}% avg · ${row.winRate}% up · n=${row.samples}`}
            >
              <div className="flex h-24 w-full items-end">
                <div
                  className={cn("w-full rounded-t", retBarColor(v))}
                  style={{ height: `${h}%`, minHeight: row.samples > 0 ? 3 : 0 }}
                />
              </div>
              <span
                className={cn(
                  "text-[8px] tabular-nums",
                  isToday ? "font-bold text-brand-bright" : "text-zinc-600"
                )}
              >
                {row.day}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-zinc-600">
        Each bar = average session return on that calendar day in {monthLabel},
        using only years in the current presidential-cycle phase.
      </p>
    </div>
  );
}

function IntradayHighLowChart({
  rows,
  sampleDays,
}: {
  rows: IntradayBucketRow[];
  sampleDays: number;
}) {
  const maxShare = Math.max(
    ...rows.flatMap((r) => [r.highSharePct, r.lowSharePct]),
    1
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-[10px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-500" />
          Session high
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-rose-500" />
          Session low
        </span>
      </div>
      <div className="flex items-end gap-2">
        {rows.map((row) => (
          <div
            key={row.hourEt}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
          >
            <div className="flex h-28 w-full items-end justify-center gap-0.5">
              <div
                className="w-[42%] rounded-t bg-emerald-500/85"
                style={{
                  height: `${(row.highSharePct / maxShare) * 100}%`,
                  minHeight: row.highSharePct > 0 ? 4 : 0,
                }}
                title={`High at ${row.label}: ${row.highSharePct}%`}
              />
              <div
                className="w-[42%] rounded-t bg-rose-500/85"
                style={{
                  height: `${(row.lowSharePct / maxShare) * 100}%`,
                  minHeight: row.lowSharePct > 0 ? 4 : 0,
                }}
                title={`Low at ${row.label}: ${row.lowSharePct}%`}
              />
            </div>
            <span className="text-[9px] text-zinc-500">{row.label}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-zinc-600">
        Regular session only (10am–3pm ET buckets) · {sampleDays.toLocaleString()}{" "}
        sessions (~2y)
      </p>
    </div>
  );
}

function ActionCards({ signals }: { signals: ActionSignal[] }) {
  if (signals.length === 0) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {signals.map((s, i) => (
        <div
          key={i}
          className={cn("rounded-xl border px-4 py-3", stanceStyles(s.stance))}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {stanceLabel(s.stance)}
          </p>
          <p className="mt-1 text-sm font-medium text-white">{s.headline}</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            {s.detail}
          </p>
        </div>
      ))}
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

export function StatisticsPage({ bookTickers = [] }: Props) {
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
  const [selectedMonth, setSelectedMonth] = useState(marketToday.month);

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
      const data = (await res.json()) as SeasonalityModel;
      setModel(data);
      setSelectedMonth(data.asOfMonth);
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

  const selectedMonthRow = model?.cycleMonthly[selectedMonth - 1];
  const dayRows = model?.cycleDaysByMonth[String(selectedMonth)] ?? [];
  const selectedMonthName = MONTH_NAMES[selectedMonth - 1] ?? "Month";

  function shiftMonth(delta: number) {
    setSelectedMonth((m) => {
      let next = m + delta;
      if (next < 1) next = 12;
      if (next > 12) next = 1;
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Statistics</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Actionable seasonality — when to deploy cash vs stay fully invested,
            filtered to the presidential cycle year we&apos;re in.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-zinc-500">
            Symbol
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
              onSelectMonth={setSelectedMonth}
            />
            {selectedMonthRow && (
              <div className="mt-5 rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-200">
                    {MONTH_NAMES[selectedMonth - 1]} history
                  </p>
                  <p className={cn("text-sm tabular-nums font-semibold", retText(selectedMonthRow.avgMonthReturnPct))}>
                    avg {selectedMonthRow.avgMonthReturnPct >= 0 ? "+" : ""}
                    {selectedMonthRow.avgMonthReturnPct}% ·{" "}
                    {selectedMonthRow.winRate}% win · n={selectedMonthRow.samples}
                  </p>
                </div>
                <div className="mt-3">
                  <MonthHistoryTable row={selectedMonthRow} />
                </div>
              </div>
            )}
          </Section>

          <Section
            title="Daily rhythm within the month"
            subtitle="How each calendar day tends to trade — cycle-filtered, one month at a time."
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <div className="text-center">
                <p className="text-sm font-semibold text-white">
                  {selectedMonthName}
                </p>
                {selectedMonth === model.asOfMonth && (
                  <p className="text-[10px] text-brand-bright">Current month</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
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
                    onClick={() => setSelectedMonth(m)}
                    className={cn(
                      "rounded-md px-2 py-1 text-[11px] font-medium transition",
                      selectedMonth === m
                        ? "bg-brand text-[#121214]"
                        : m === model.asOfMonth
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
              monthLabel={selectedMonthName}
              todayDay={
                selectedMonth === marketToday.month ? marketToday.day : null
              }
            />
          </Section>

          <Section
            title="When highs & lows print (regular hours)"
            subtitle="Single view — green = hour that tends to mark the session high, red = session low. Use for entry timing."
          >
            <IntradayHighLowChart
              rows={model.intradayHighLow}
              sampleDays={model.intradaySampleDays}
            />
          </Section>
        </>
      )}
    </div>
  );
}
