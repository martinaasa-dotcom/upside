"use client";

import { FluidRow, FluidTable, cellBase } from "@/components/FluidTable";
import { cn, currency, percent } from "@/lib/format";
import type { ForecastModel } from "@/lib/forecast";
import {
  loadForecastPlan,
  saveForecastPlan,
  type ForecastPlan,
} from "@/lib/forecast-plan";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  model: ForecastModel;
  portfolioId: string;
  portfolioName: string;
  cashBalance: number;
};

function signedTone(value: number) {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-rose-400";
  return "text-zinc-300";
}

function yearLabel(year: number) {
  return `EOY ${year}`;
}

function formatGeneratedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ForecastPanel({
  model,
  portfolioId,
  portfolioName,
  cashBalance,
}: Props) {
  const yearCols = model.years;
  const template = `minmax(4.5rem, 0.7fr) minmax(5.5rem, 1fr) ${yearCols
    .map(() => "minmax(5.5rem, 1fr)")
    .join(" ")} minmax(4rem, 0.7fr)`;

  const [plan, setPlan] = useState<ForecastPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPlan(loadForecastPlan(portfolioId));
    setError(null);
  }, [portfolioId]);

  async function askMargus() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/forecast/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId,
          portfolioName,
          cashBalance,
          forecast: model,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to generate plan");
      }
      const next = data.plan as ForecastPlan;
      saveForecastPlan(next);
      setPlan(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/40">
      <header className="border-b border-zinc-800/80 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Forecast</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Stock price targets · portfolio totals = current shares × forecasted
          SP · next {yearCols.length} years
        </p>
      </header>

      {model.rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-zinc-500">
          Add holdings to project EOY prices.
        </div>
      ) : (
        <>
          {/* Mobile */}
          <div className="space-y-2 p-3 md:hidden">
            {model.rows.map((r) => (
              <div
                key={r.ticker}
                className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-white">
                      {r.ticker}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {r.shares.toLocaleString("en-US")} shares
                      {!r.hasTargets && " · flat (no house target)"}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "text-sm font-medium tabular-nums",
                      r.gainPct != null
                        ? signedTone(r.gainPct)
                        : "text-zinc-600"
                    )}
                  >
                    {r.gainPct != null ? percent(r.gainPct) : "—"}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-zinc-500">Current SP</p>
                    <p className="tabular-nums text-zinc-100">
                      {currency(r.currentPrice)}
                    </p>
                  </div>
                  {yearCols.map((y) => (
                    <div key={y}>
                      <p className="text-zinc-500">{yearLabel(y)}</p>
                      <p className="tabular-nums text-zinc-100">
                        {currency(r.eoyPrices[y])}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-3 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Portfolio value
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                {currency(model.currentTotal)}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {yearCols.map((y) => (
                  <div key={y}>
                    <p className="text-zinc-500">{yearLabel(y)}</p>
                    <p className="tabular-nums text-zinc-100">
                      {currency(model.eoyTotals[y])}
                    </p>
                  </div>
                ))}
              </div>
              {model.gainPct != null && (
                <p
                  className={cn(
                    "mt-3 text-sm font-medium tabular-nums",
                    signedTone(model.gainPct)
                  )}
                >
                  To {yearCols[yearCols.length - 1]} · {percent(model.gainPct)}
                </p>
              )}
            </div>
          </div>

          {/* Desktop */}
          <div className="hidden overflow-x-auto md:block">
            <FluidTable template={template}>
              <FluidRow className="border-zinc-800 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                <div className={cellBase}>Ticker</div>
                <div className={cellBase}>Current SP</div>
                {yearCols.map((y) => (
                  <div key={y} className={cellBase}>
                    {yearLabel(y)}
                  </div>
                ))}
                <div className={cellBase}>Gain</div>
              </FluidRow>

              {model.rows.map((r) => (
                <FluidRow key={r.ticker} className="hover:bg-zinc-900/40">
                  <div
                    className={cn(
                      cellBase,
                      "font-semibold tracking-wide text-white"
                    )}
                  >
                    {r.ticker}
                  </div>
                  <div className={cn(cellBase, "tabular-nums text-zinc-100")}>
                    {currency(r.currentPrice)}
                  </div>
                  {yearCols.map((y) => (
                    <div
                      key={y}
                      className={cn(
                        cellBase,
                        "tabular-nums",
                        r.hasTargets ? "text-zinc-100" : "text-zinc-500"
                      )}
                    >
                      {currency(r.eoyPrices[y])}
                    </div>
                  ))}
                  <div
                    className={cn(
                      cellBase,
                      "tabular-nums font-medium",
                      r.gainPct != null
                        ? signedTone(r.gainPct)
                        : "text-zinc-600"
                    )}
                  >
                    {r.gainPct != null ? percent(r.gainPct) : "—"}
                  </div>
                </FluidRow>
              ))}

              <FluidRow className="border-t border-zinc-700 bg-zinc-900/60 font-semibold">
                <div className={cn(cellBase, "py-2.5 text-white")}>
                  Portfolio
                </div>
                <div
                  className={cn(cellBase, "py-2.5 tabular-nums text-white")}
                >
                  {currency(model.currentTotal)}
                </div>
                {yearCols.map((y) => (
                  <div
                    key={y}
                    className={cn(cellBase, "py-2.5 tabular-nums text-white")}
                  >
                    {currency(model.eoyTotals[y])}
                  </div>
                ))}
                <div
                  className={cn(
                    cellBase,
                    "py-2.5 tabular-nums",
                    model.gainPct != null
                      ? signedTone(model.gainPct)
                      : "text-zinc-600"
                  )}
                >
                  {model.gainPct != null ? percent(model.gainPct) : "—"}
                </div>
              </FluidRow>
            </FluidTable>
          </div>
        </>
      )}

      <div className="border-t border-zinc-800/80 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Margus plan · themes / trim / add
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Dynamic quarter + year themes with sector rotation — not a static
              sheet paste.
            </p>
            {plan?.generatedAt && (
              <p className="mt-1 text-[11px] text-zinc-600">
                Last generated {formatGeneratedAt(plan.generatedAt)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void askMargus()}
            disabled={busy || model.rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/60 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:border-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {busy
              ? "Margus is planning…"
              : plan
                ? "Refresh Margus plan"
                : "Ask Margus for a plan"}
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        )}

        {!plan && !busy && !error && (
          <div className="mt-3 rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center">
            <p className="text-sm text-zinc-400">
              No plan yet. Ask Margus to draft next-quarter and next-year themes,
              sector rotation notes, and concrete add / trim actions for this
              sheet.
            </p>
          </div>
        )}

        {plan && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  General advice
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">
                  {plan.generalAdvice}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Sector rotation
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">
                  {plan.sectorRotation}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plan.periods.map((s) => (
                <div
                  key={`${s.label}-${s.theme}`}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-3"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400/90">
                    {s.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {s.theme}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                    <span className="font-medium text-emerald-300/90">Add</span>{" "}
                    {s.add}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    <span className="font-medium text-rose-300/90">Trim</span>{" "}
                    {s.trim}
                  </p>
                  {s.notes && (
                    <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                      {s.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
