"use client";

import { HeaderBrand } from "@/components/HeaderBrand";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { Sparkline } from "@/components/Sparkline";
import { currency, percent, signedCurrency, cn } from "@/lib/format";
import { MARGUS_FUND_DISCLAIMER } from "@/lib/disclaimer";
import type { Quote } from "@/lib/types";
import {
  Bot,
  Minus,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type FundRow = {
  cash: number;
  starting_capital: number;
  inception_date: string;
};

type HoldingRow = {
  id: string;
  ticker: string;
  shares: number;
  cost_basis: number;
  entry_date: string;
  thesis: string;
  target_timeframe: string | null;
  exit_plan: string | null;
  status: "open" | "closed";
  closed_at: string | null;
  exit_reasoning: string | null;
  realized_pnl: number | null;
};

type FundActionRow = {
  type: "hold" | "trim" | "add" | "exit" | "buy";
  ticker: string;
  reasoning: string;
  shares?: number;
  price?: number;
  dollarAmount?: number;
};

type ReportRow = {
  id: string;
  report_date: string;
  headline: string;
  body: string;
  actions: FundActionRow[];
  portfolio_value: number;
  cash: number;
  day_change_dollar: number | null;
  day_change_pct: number | null;
  total_return_pct: number | null;
};

function fmtDate(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

const ACTION_STYLE: Record<
  FundActionRow["type"],
  { label: string; cls: string }
> = {
  buy: { label: "Opened", cls: "bg-emerald-500/15 text-emerald-300" },
  add: { label: "Added", cls: "bg-emerald-500/15 text-emerald-300" },
  trim: { label: "Trimmed", cls: "bg-amber-500/15 text-amber-300" },
  exit: { label: "Exited", cls: "bg-rose-500/15 text-rose-300" },
  hold: { label: "Held", cls: "bg-zinc-700/40 text-zinc-400" },
};

function ActionBadge({ action }: { action: FundActionRow }) {
  const meta = ACTION_STYLE[action.type];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        meta.cls
      )}
    >
      {meta.label} {action.ticker}
    </span>
  );
}

export function MargusFundPage() {
  const [fund, setFund] = useState<FundRow | null>(null);
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/margus-fund", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setFund(data.fund);
      setHoldings(data.holdings ?? []);
      setReports(data.reports ?? []);
      setQuotes(data.quotes ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const openHoldings = useMemo(
    () => holdings.filter((h) => h.status === "open"),
    [holdings]
  );
  const closedHoldings = useMemo(
    () => holdings.filter((h) => h.status === "closed"),
    [holdings]
  );

  const latestReport = reports[0] ?? null;
  const totalValue = latestReport?.portfolio_value ?? fund?.starting_capital ?? 0;
  const cash = latestReport?.cash ?? fund?.cash ?? 0;
  const totalReturnPct = latestReport?.total_return_pct ?? 0;
  const totalReturnDollar = totalValue - (fund?.starting_capital ?? 0);
  const todayDollar = latestReport?.day_change_dollar ?? 0;
  const todayPct = latestReport?.day_change_pct ?? null;

  const valueHistory = useMemo(
    () =>
      [...reports]
        .reverse()
        .map((r) => r.portfolio_value)
        .concat(fund ? [] : []),
    [reports, fund]
  );

  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_#1f1a12_0%,_#121214_55%)] text-zinc-100">
      <header className="border-b border-brand-deep/25 bg-[#121214]/90 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <HeaderBrand />
            <WorkspaceSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-mid/40 bg-brand/15 text-brand-bright">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                Margus Fund
              </h1>
              <button
                type="button"
                onClick={() => void load(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                Refresh
              </button>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              Margus runs his own paper portfolio — one decision a day, every
              trade with a stated thesis, timeline, and exit plan.
            </p>
          </div>
        </div>

        <p className="rounded-xl border border-amber-500/25 bg-amber-950/15 px-3.5 py-2.5 text-xs leading-relaxed text-amber-200/90">
          {MARGUS_FUND_DISCLAIMER}
        </p>

        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <>
            <section className="rounded-2xl border border-brand-deep/30 bg-[#161618]/70 p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Total value
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-white sm:text-xl">
                    {currency(totalValue, 0)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Today
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-lg font-semibold tabular-nums sm:text-xl",
                      todayDollar > 0
                        ? "text-gain"
                        : todayDollar < 0
                          ? "text-loss"
                          : "text-white"
                    )}
                  >
                    {signedCurrency(todayDollar)}
                  </p>
                  {todayPct != null && (
                    <p className="text-[11px] text-zinc-500">{percent(todayPct)}</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Total return
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-lg font-semibold tabular-nums sm:text-xl",
                      totalReturnDollar > 0
                        ? "text-gain"
                        : totalReturnDollar < 0
                          ? "text-loss"
                          : "text-white"
                    )}
                  >
                    {percent(totalReturnPct)}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {signedCurrency(totalReturnDollar)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                    Cash
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-white sm:text-xl">
                    {currency(cash, 0)}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    of {currency(fund?.starting_capital ?? 0, 0)} start
                  </p>
                </div>
              </div>
              {valueHistory.length > 2 && (
                <div className="mt-4 border-t border-zinc-800/80 pt-3">
                  <Sparkline points={valueHistory} width={640} height={48} className="w-full" />
                </div>
              )}
            </section>

            {openHoldings.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  Open positions · {openHoldings.length}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {openHoldings.map((h) => {
                    const q = quotes[h.ticker];
                    const price = q?.price ?? h.cost_basis;
                    const pnlPct =
                      h.cost_basis > 0 ? (price - h.cost_basis) / h.cost_basis : 0;
                    const marketValue = price * h.shares;
                    return (
                      <div
                        key={h.id}
                        className="space-y-2 rounded-xl border border-brand-deep/30 bg-[#161618]/70 p-3.5"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-base font-semibold text-white">
                            {h.ticker}
                          </span>
                          <span
                            className={cn(
                              "flex items-center gap-1 text-sm font-semibold tabular-nums",
                              pnlPct >= 0 ? "text-gain" : "text-loss"
                            )}
                          >
                            {pnlPct >= 0 ? (
                              <TrendingUp className="h-3.5 w-3.5" />
                            ) : (
                              <TrendingDown className="h-3.5 w-3.5" />
                            )}
                            {percent(pnlPct)}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500">
                          {currency(marketValue, 0)} · entered {fmtDate(h.entry_date)} at{" "}
                          {currency(h.cost_basis)}, now {currency(price)}
                        </p>
                        <p className="text-xs leading-relaxed text-zinc-400">
                          {h.thesis}
                        </p>
                        <div className="flex flex-wrap gap-1.5 text-[10px] text-zinc-500">
                          {h.target_timeframe && (
                            <span className="rounded-md bg-zinc-800/80 px-1.5 py-0.5">
                              Timeline: {h.target_timeframe}
                            </span>
                          )}
                          {h.exit_plan && (
                            <span className="rounded-md bg-zinc-800/80 px-1.5 py-0.5">
                              Exit: {h.exit_plan}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Daily reports
              </h2>
              {reports.length === 0 ? (
                <p className="rounded-2xl border border-brand-deep/30 bg-[#161618]/70 px-4 py-6 text-center text-sm text-zinc-500">
                  No reports yet — Margus&apos;s first daily decision runs
                  after today&apos;s market close.
                </p>
              ) : (
                <div className="space-y-3">
                  {reports.map((r) => (
                    <article
                      key={r.id}
                      className="space-y-2 rounded-2xl border border-brand-deep/30 bg-[#161618]/70 p-4"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                          {fmtDate(r.report_date)}
                        </p>
                        <p
                          className={cn(
                            "text-xs font-semibold tabular-nums",
                            (r.day_change_dollar ?? 0) > 0
                              ? "text-gain"
                              : (r.day_change_dollar ?? 0) < 0
                                ? "text-loss"
                                : "text-zinc-500"
                          )}
                        >
                          {currency(r.portfolio_value, 0)}
                          {r.day_change_dollar != null && (
                            <> · {signedCurrency(r.day_change_dollar)}</>
                          )}
                        </p>
                      </div>
                      <h3 className="text-sm font-semibold text-white">
                        {r.headline}
                      </h3>
                      {r.actions?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {r.actions
                            .filter((a) => a.type !== "hold")
                            .map((a, i) => (
                              <ActionBadge key={`${a.ticker}-${i}`} action={a} />
                            ))}
                        </div>
                      )}
                      <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-400">
                        {r.body}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {closedHoldings.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  Closed positions · {closedHoldings.length}
                </h2>
                <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-brand-deep/30 bg-[#161618]/70">
                  {closedHoldings.map((h) => (
                    <li key={h.id} className="px-4 py-2.5 text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-zinc-200">
                          {h.ticker}
                        </span>
                        <span
                          className={cn(
                            "flex items-center gap-1 text-xs font-semibold tabular-nums",
                            (h.realized_pnl ?? 0) >= 0 ? "text-gain" : "text-loss"
                          )}
                        >
                          {(h.realized_pnl ?? 0) >= 0 ? (
                            <Plus className="h-3 w-3" />
                          ) : (
                            <Minus className="h-3 w-3" />
                          )}
                          {currency(Math.abs(h.realized_pnl ?? 0), 0)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {fmtDate(h.entry_date)} → {h.closed_at ? fmtDate(h.closed_at) : "—"}
                        {h.exit_reasoning ? ` · ${h.exit_reasoning}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
