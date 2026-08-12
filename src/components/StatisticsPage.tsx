"use client";

import { cn } from "@/lib/format";
import type {
  CyclePhaseReturnRow,
  DayOfYearRow,
  IntradayBucketRow,
  MonthSeasonRow,
  PresidencyReturnRow,
  SeasonalityModel,
  YearReturnRow,
} from "@/lib/market/seasonality";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_TICKERS = ["SPY", "^GSPC", "QQQ", "IWM", "DIA"];

type Props = {
  bookTickers?: string[];
};

function retColor(v: number): string {
  if (v > 0.05) return "bg-emerald-500";
  if (v < -0.05) return "bg-rose-500";
  return "bg-zinc-600";
}

function retText(v: number): string {
  if (v > 0) return "text-gain";
  if (v < 0) return "text-loss";
  return "text-zinc-400";
}

function BarChart({
  items,
  valueKey,
  labelKey,
  maxAbs,
  formatValue,
  className,
}: {
  items: Array<Record<string, string | number>>;
  valueKey: string;
  labelKey: string;
  maxAbs?: number;
  formatValue?: (v: number) => string;
  className?: string;
}) {
  const max =
    maxAbs ??
    Math.max(
      ...items.map((i) => Math.abs(Number(i[valueKey]) || 0)),
      0.01
    );

  return (
    <div className={cn("flex items-end gap-1", className)}>
      {items.map((item, idx) => {
        const v = Number(item[valueKey]) || 0;
        const h = Math.max(4, (Math.abs(v) / max) * 100);
        return (
          <div
            key={`${item[labelKey]}-${idx}`}
            className="group flex min-w-0 flex-1 flex-col items-center gap-1"
            title={`${item[labelKey]}: ${formatValue ? formatValue(v) : v}`}
          >
            <div className="flex h-24 w-full items-end justify-center">
              <div
                className={cn(
                  "w-full max-w-[2rem] rounded-t transition group-hover:opacity-90",
                  retColor(v)
                )}
                style={{ height: `${h}%` }}
              />
            </div>
            <span className="max-w-full truncate text-[9px] text-zinc-500">
              {String(item[labelKey])}
            </span>
          </div>
        );
      })}
    </div>
  );
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

function YearReturnsTable({ rows }: { rows: YearReturnRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wide text-zinc-500">
            <th className="pb-2 pr-3 font-medium">Year</th>
            <th className="pb-2 pr-3 font-medium">Return</th>
            <th className="pb-2 pr-3 font-medium">President</th>
            <th className="pb-2 font-medium">Cycle</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.year} className="border-b border-zinc-800/70">
              <td className="py-2 pr-3 tabular-nums text-zinc-300">{row.year}</td>
              <td
                className={cn(
                  "py-2 pr-3 font-medium tabular-nums",
                  retText(row.returnPct)
                )}
              >
                {row.returnPct >= 0 ? "+" : ""}
                {row.returnPct.toFixed(2)}%
              </td>
              <td className="py-2 pr-3 text-zinc-400">
                {row.president ?? "—"}
                {row.party ? (
                  <span className="ml-1 text-[10px] text-zinc-600">
                    ({row.party})
                  </span>
                ) : null}
              </td>
              <td className="py-2 text-zinc-500">{row.cycleLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PresidencyBars({ rows }: { rows: PresidencyReturnRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.presidentId}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium text-zinc-200">
              {row.president}
              <span className="ml-1 text-zinc-600">({row.party})</span>
            </span>
            <span className={cn("tabular-nums", retText(row.avgReturnPct))}>
              avg {row.avgReturnPct >= 0 ? "+" : ""}
              {row.avgReturnPct.toFixed(2)}%/yr · {row.years}y
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={cn(
                "h-full rounded-full",
                row.avgReturnPct >= 0 ? "bg-emerald-500" : "bg-rose-500"
              )}
              style={{
                width: `${Math.min(100, Math.abs(row.avgReturnPct) * 4)}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DayOfYearHeat({ rows }: { rows: DayOfYearRow[] }) {
  const maxAbs = useMemo(
    () =>
      Math.max(...rows.map((r) => Math.abs(r.avgReturnPct)), 0.001),
    [rows]
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-px">
        {rows.map((row) => {
          const v = row.avgReturnPct;
          const intensity = Math.min(1, Math.abs(v) / maxAbs);
          const bg =
            v > 0
              ? `rgba(52, 211, 153, ${0.15 + intensity * 0.75})`
              : v < 0
                ? `rgba(248, 113, 113, ${0.15 + intensity * 0.75})`
                : "rgb(39 39 42)";
          return (
            <div
              key={row.dayOfYear}
              className="h-3 w-[3px] shrink-0 rounded-[1px]"
              style={{ backgroundColor: bg }}
              title={`${row.label}: ${v >= 0 ? "+" : ""}${v.toFixed(3)}% avg (${row.samples}d)`}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-zinc-600">
        <span>Jan 1</span>
        <span>Dec 31</span>
      </div>
    </div>
  );
}

function IntradayChart({ rows, sampleDays }: { rows: IntradayBucketRow[]; sampleDays: number }) {
  const maxHigh = Math.max(...rows.map((r) => r.highSharePct), 1);
  const maxLow = Math.max(...rows.map((r) => r.lowSharePct), 1);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-medium text-zinc-400">
          Session highs by hour
        </p>
        <div className="flex items-end gap-1.5">
          {rows.map((row) => (
            <div key={`h-${row.hourEt}`} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-20 w-full items-end">
                <div
                  className="w-full rounded-t bg-emerald-500/80"
                  style={{
                    height: `${(row.highSharePct / maxHigh) * 100}%`,
                    minHeight: row.highSharePct > 0 ? 4 : 0,
                  }}
                  title={`${row.label}: ${row.highSharePct}% of days`}
                />
              </div>
              <span className="text-[9px] text-zinc-600">{row.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-zinc-400">
          Session lows by hour
        </p>
        <div className="flex items-end gap-1.5">
          {rows.map((row) => (
            <div key={`l-${row.hourEt}`} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-20 w-full items-end">
                <div
                  className="w-full rounded-t bg-rose-500/80"
                  style={{
                    height: `${(row.lowSharePct / maxLow) * 100}%`,
                    minHeight: row.lowSharePct > 0 ? 4 : 0,
                  }}
                  title={`${row.label}: ${row.lowSharePct}% of days`}
                />
              </div>
              <span className="text-[9px] text-zinc-600">{row.label}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-zinc-600 lg:col-span-2">
        Based on {sampleDays.toLocaleString()} sessions with hourly bars (~2y lookback).
      </p>
    </div>
  );
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

  const [ticker, setTicker] = useState("SPY");
  const [model, setModel] = useState<SeasonalityModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const recentYears = model?.yearReturns.slice(-20) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Statistics</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Seasonality — year returns, presidency, calendar patterns, intraday
            highs & lows.
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
          <p className="text-[11px] text-zinc-600">
            {model.ticker} · {model.from} → {model.to} ·{" "}
            {model.tradingDays.toLocaleString()} sessions
          </p>

          <Section
            title="Year returns"
            subtitle="Calendar-year total return — top-down view of which years paid and which didn't."
          >
            <BarChart
              items={recentYears.map((r) => ({
                label: String(r.year),
                value: r.returnPct,
              }))}
              valueKey="value"
              labelKey="label"
              formatValue={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
              className="mb-5"
            />
            <YearReturnsTable rows={model.yearReturns} />
          </Section>

          <Section
            title="By presidency"
            subtitle="Average calendar-year return while each administration was in office (Dec 31 snapshot)."
          >
            <PresidencyBars rows={model.presidencyReturns} />
          </Section>

          <Section
            title="Presidential cycle"
            subtitle="Post-election, midterm, pre-election, and election years compared across the full sample."
          >
            <BarChart
              items={model.cycleReturns.map((r: CyclePhaseReturnRow) => ({
                label: r.label.split(" ")[0] ?? r.label,
                value: r.avgReturnPct,
              }))}
              valueKey="value"
              labelKey="label"
              formatValue={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}% avg`}
            />
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {model.cycleReturns.map((row) => (
                <li
                  key={row.phase}
                  className="flex justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-sm"
                >
                  <span className="text-zinc-400">{row.label}</span>
                  <span className={cn("tabular-nums font-medium", retText(row.avgReturnPct))}>
                    {row.avgReturnPct >= 0 ? "+" : ""}
                    {row.avgReturnPct.toFixed(2)}%
                    <span className="ml-1 text-[11px] font-normal text-zinc-600">
                      ({row.years}y)
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="Monthly seasonality"
            subtitle="Average daily return aggregated by calendar month — classic month-of-year pattern."
          >
            <BarChart
              items={model.monthlySeason.map((r: MonthSeasonRow) => ({
                label: r.label,
                value: r.avgReturnPct,
              }))}
              valueKey="value"
              labelKey="label"
              formatValue={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}%/day`}
            />
            <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {model.monthlySeason.map((row) => (
                <li
                  key={row.month}
                  className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-2.5 py-2 text-xs"
                >
                  <span className="text-zinc-400">{row.label}</span>
                  <p className={cn("mt-0.5 font-semibold tabular-nums", retText(row.avgReturnPct))}>
                    {row.avgReturnPct >= 0 ? "+" : ""}
                    {row.avgReturnPct.toFixed(3)}%/day
                  </p>
                  <p className="text-[10px] text-zinc-600">
                    {row.winRate}% up · {row.samples}d
                  </p>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="Day-of-year seasonality"
            subtitle="Average return for each calendar date (Jan 1 … Dec 31) across all years — not grouped by month."
          >
            <DayOfYearHeat rows={model.dayOfYearSeason} />
          </Section>

          <Section
            title="Intraday highs & lows"
            subtitle="Which hour of the US session tends to print the daily high or low (hourly bars, ~2 years)."
          >
            <IntradayChart
              rows={model.intradayHighLow}
              sampleDays={model.intradaySampleDays}
            />
          </Section>
        </>
      )}
    </div>
  );
}
