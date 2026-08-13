"use client";

import { track } from "@vercel/analytics";
import { FluidRow, FluidTable } from "@/components/FluidTable";
import { FORECAST_DISCLAIMER } from "@/lib/disclaimer";
import { cn, signedTone, currency, percent, cashtag } from "@/lib/format";
import type { ForecastModel, ForecastYear } from "@/lib/forecast";
import {
  ensureCompleteEoyTargets,
  DEFAULT_FORECAST_STANCE,
  loadForecastPlan,
  planEoyPaths,
  saveForecastPlan,
  shouldAutoRefreshForecast,
  forecastHoldingsKey,
  type ForecastPlan,
  type ForecastStance,
} from "@/lib/forecast-plan";
import type { ConvictionMap } from "@/lib/conviction";
import { readJsonOrThrow } from "@/lib/http";
import { countOverrides } from "@/lib/forecast-overrides";
import type { PortfolioEoyOverrides } from "@/lib/forecast-overrides";
import { isForecastFullyCovered } from "@/lib/forecast";
import { blockWheelChange } from "@/lib/number-input";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  model: ForecastModel;
  portfolioId: string;
  portfolioName: string;
  cashBalance: number;
  overrides: PortfolioEoyOverrides;
  onSetEoyPrice: (ticker: string, year: ForecastYear, price: number) => void;
  onApplyMargusPaths: (
    paths: { ticker: string; prices: Partial<Record<ForecastYear, number>> }[]
  ) => void;
  onClearOverrides: () => void;
  /** Owner's per-ticker conviction, passed to Margus so a written thesis
   * actually influences the path instead of being ignored. */
  convictions?: ConvictionMap;
};

function calibratedPaths(
  plan: ForecastPlan,
  model: ForecastModel,
  stance: ForecastStance = DEFAULT_FORECAST_STANCE
) {
  const eoyTargets = ensureCompleteEoyTargets(
    model,
    plan.eoyTargets ?? [],
    stance
  );
  return {
    eoyTargets,
    paths: planEoyPaths({ ...plan, eoyTargets, stance }),
  };
}

function yearLabel(year: number) {
  return `EOY ${year}`;
}

/** Current calendar year gets a "this year" cue so the nearest, most-actionable
 * target doesn't blend into the same-looking longer-horizon columns. */
function isCurrentYear(year: number) {
  return year === new Date().getFullYear();
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

function EoyPriceInput({
  value,
  targeted,
  onCommit,
}: {
  value: number;
  targeted: boolean;
  onCommit: (n: number) => void;
}) {
  const display = value.toFixed(2);
  const [draft, setDraft] = useState(display);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(display);
  }, [display]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      title={targeted ? "Edit EOY target" : "Awaiting Margus path, or type a price"}
      onChange={(e) => {
        setDraft(e.target.value.replace(/,/g, ".").replace(/[^\d.-]/g, ""));
      }}
      onFocus={() => {
        focused.current = true;
      }}
      onWheel={blockWheelChange}
      onBlur={() => {
        focused.current = false;
        const n = Number.parseFloat(draft);
        if (!Number.isNaN(n) && n > 0) {
          onCommit(Math.round(n * 100) / 100);
        } else {
          setDraft(display);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(display);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(
        "inline-edit no-spinner mx-auto w-[5.5rem] max-w-full rounded-t px-1 py-0.5 text-center tabular-nums outline-none hover:bg-zinc-800/50 focus:bg-zinc-900 focus:ring-1 focus:ring-brand/40",
        targeted ? "text-zinc-100" : "text-zinc-400"
      )}
    />
  );
}

// Centered throughout, matching the shared `cellBase` convention every
// other table (PortfolioTable, CoveredCallPanel) already uses — this used
// to be right-aligned here specifically, which read as an inconsistent
// one-off next to its siblings.
const cellLabel =
  "flex min-w-0 w-full flex-col items-center justify-center whitespace-nowrap px-3 py-2 text-center";
const cellNum =
  "flex min-w-0 w-full items-center justify-center whitespace-nowrap px-3 py-2 text-center tabular-nums";

export function ForecastPanel({
  model,
  portfolioId,
  portfolioName,
  cashBalance,
  overrides,
  onSetEoyPrice,
  onApplyMargusPaths,
  onClearOverrides,
  convictions,
}: Props) {
  const yearCols = model.years;
  // Ticker | Current SP | EOY×N | Gain — numeric cols share width evenly.
  // Kept as tight as the content allows (not PortfolioTable-style max-content)
  // since 5 EOY-year columns + Current SP + Gain is the widest grid in the
  // app; a looser floor here overflows well before the shared `md:` table
  // breakpoint, forcing an early horizontal scrollbar on tablets/laptops.
  const template = `minmax(4rem, 0.7fr) repeat(${yearCols.length + 1}, minmax(5rem, 1fr)) minmax(4rem, 0.6fr)`;

  const [plan, setPlan] = useState<ForecastPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedFlash, setAppliedFlash] = useState(false);
  const overrideCount = countOverrides(overrides);
  const flatCount = model.rows.filter((r) => !r.hasTargets).length;
  const holdingsKey = forecastHoldingsKey(model.rows.map((r) => r.ticker));
  const fullyCovered = isForecastFullyCovered(
    model.rows.map((r) => r.ticker),
    overrides
  );
  const autoKeyRef = useRef<string>("");
  const reappliedRef = useRef<string>("");
  const calibrateKeyRef = useRef<string>("");
  const askInFlight = useRef(false);
  const [planHydrated, setPlanHydrated] = useState(false);
  const [stance, setStance] = useState<ForecastStance>(DEFAULT_FORECAST_STANCE);

  useEffect(() => {
    setPlanHydrated(false);
    const loaded = loadForecastPlan(portfolioId);
    setPlan(loaded);
    setStance(loaded?.stance ?? DEFAULT_FORECAST_STANCE);
    setError(null);
    setAppliedFlash(false);
    autoKeyRef.current = "";
    reappliedRef.current = "";
    calibrateKeyRef.current = "";
    setPlanHydrated(true);
  }, [portfolioId]);

  async function askMargus(opts?: { auto?: boolean; stance?: ForecastStance }) {
    if (askInFlight.current) return;
    askInFlight.current = true;
    const usedStance = opts?.stance ?? stance;
    if (!opts?.auto) track("forecast_plan_requested");
    setBusy(true);
    setError(null);
    setAppliedFlash(false);
    try {
      const res = await fetch("/api/forecast/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId,
          portfolioName,
          cashBalance,
          forecast: model,
          stance: usedStance,
          convictions,
        }),
      });
      const data = await readJsonOrThrow<{ plan: ForecastPlan }>(
        res,
        "Failed to generate plan"
      );
      const next: ForecastPlan = {
        ...(data.plan as ForecastPlan),
        holdingsKey,
        stance: usedStance,
      };
      const { eoyTargets, paths } = calibratedPaths(next, model, usedStance);
      const calibrated: ForecastPlan = {
        ...next,
        eoyTargets,
        stance: usedStance,
      };
      saveForecastPlan(calibrated);
      setPlan(calibrated);

      if (paths.length > 0) {
        onApplyMargusPaths(paths);
        setAppliedFlash(true);
      }
      autoKeyRef.current = `${portfolioId}:${holdingsKey}:${calibrated.generatedAt}`;
      reappliedRef.current = `${portfolioId}:${holdingsKey}:reapply`;
      calibrateKeyRef.current = `${portfolioId}:${holdingsKey}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate plan");
      if (opts?.auto) {
        autoKeyRef.current = "";
      }
    } finally {
      askInFlight.current = false;
      setBusy(false);
    }
  }

  // Upgrade cached timid plans (e.g. NBIS 182) to spreadsheet BASE without waiting for LLM.
  useEffect(() => {
    if (model.rows.length === 0) return;
    if (!plan || (plan.eoyTargets?.length ?? 0) === 0) return;
    const key = `${portfolioId}:${holdingsKey}`;
    if (calibrateKeyRef.current === key) return;
    calibrateKeyRef.current = key;

    const { eoyTargets, paths } = calibratedPaths(plan, model);
    const before = JSON.stringify(plan.eoyTargets ?? []);
    const after = JSON.stringify(eoyTargets);
    if (before === after) {
      if (flatCount > 0 && paths.length > 0) {
        onApplyMargusPaths(paths);
        reappliedRef.current = `${portfolioId}:${holdingsKey}:reapply`;
      }
      return;
    }
    const next: ForecastPlan = { ...plan, eoyTargets, holdingsKey };
    saveForecastPlan(next);
    setPlan(next);
    if (paths.length > 0) {
      onApplyMargusPaths(paths);
      reappliedRef.current = `${portfolioId}:${holdingsKey}:reapply`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one calibrate pass per sheet/holdings
  }, [portfolioId, holdingsKey, plan, model.rows.length, flatCount]);

  // Restore saved Margus prices into the grid without calling the model.
  useEffect(() => {
    if (model.rows.length === 0) return;
    if (flatCount === 0) return;
    if (!plan || (plan.eoyTargets?.length ?? 0) === 0) return;
    const key = `${portfolioId}:${holdingsKey}:reapply`;
    if (reappliedRef.current === key) return;
    reappliedRef.current = key;
    const { paths } = calibratedPaths(plan, model);
    if (paths.length > 0) onApplyMargusPaths(paths);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once per sheet/holdings
  }, [portfolioId, holdingsKey, flatCount, plan]);

  // Auto cadence: first run, then monthly. New holdings are filled locally.
  useEffect(() => {
    if (!planHydrated || model.rows.length === 0) return;
    if (askInFlight.current || busy) return;
    const decision = shouldAutoRefreshForecast({
      plan,
      tickers: model.rows.map((r) => r.ticker),
      fullyCovered,
      stance,
    });
    if (!decision.run) return;
    const key = `${portfolioId}:${holdingsKey}:${decision.reason}:${plan?.generatedAt ?? "none"}`;
    if (autoKeyRef.current === key) return;
    autoKeyRef.current = key;
    void askMargus({ auto: true, stance });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated auto refresh
  }, [planHydrated, portfolioId, holdingsKey, plan, fullyCovered, model.rows.length, busy, stance]);

  // Safety net for the brief window between "you sold this" and the
  // auto-refresh above actually landing (or if it fails/gets rate
  // limited) — the add/trim playbook is free text, so a stale plan can
  // keep naming a ticker that's no longer in the book.
  const soldTickersInPlan = useMemo(() => {
    if (!plan) return [];
    const planKey =
      plan.holdingsKey ??
      forecastHoldingsKey((plan.eoyTargets ?? []).map((t) => t.ticker));
    if (!planKey) return [];
    const planTickers = planKey.split("|").filter(Boolean);
    const current = new Set(model.rows.map((r) => r.ticker.toUpperCase()));
    return planTickers.filter((t) => !current.has(t));
  }, [plan, model.rows]);

  const statusHint = useMemo(() => {
    if (!planHydrated || model.rows.length === 0 || busy) return null;
    const decision = shouldAutoRefreshForecast({
      plan,
      tickers: model.rows.map((r) => r.ticker),
      fullyCovered,
      stance,
    });
    if (decision.run && decision.reason === "first-run") {
      return "No Margus plan yet, generating a base-case path …";
    }
    if (decision.run && decision.reason === "monthly") {
      return "Monthly thesis check, Margus is refreshing EOY if anything shifted …";
    }
    if (decision.run && decision.reason === "sold-holding") {
      return "A holding this plan named has been sold, regenerating the playbook …";
    }
    if (decision.run && decision.reason === "stance-changed") {
      return "Stance changed, Margus is re-reasoning the path …";
    }
    return null;
  }, [planHydrated, model.rows, plan, fullyCovered, busy, stance]);

  return (
    <section className="overflow-hidden rounded-xl border border-brand-deep/30 bg-[#161618]/70">
      <header className="border-b border-zinc-800/80 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-white">Forecast</h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Margus reasons an EOY price path per holding. He does a monthly
              recheck; new holdings are filled without re-scanning the whole
              sheet.
            </p>
            <p className="mt-1 text-xs text-zinc-400">{FORECAST_DISCLAIMER}</p>
            {statusHint && (
              <p className="mt-1 text-xs text-amber-200/80">{statusHint}</p>
            )}
            {flatCount > 0 && !busy && !plan && !statusHint && (
              <p className="mt-1 text-xs text-amber-200/80">
                No saved forecast yet. Margus will lock prices in shortly.
              </p>
            )}
            {busy && (
              <p className="mt-1 text-xs text-amber-200/80">
                Margus is updating the forecast …
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-950/50 p-0.5">
              {(
                [
                  ["bearish", "Bear"],
                  ["base", "Base"],
                  ["bullish", "Bull"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  disabled={busy || model.rows.length === 0}
                  onClick={() => {
                    if (id === stance) return;
                    setStance(id);
                    void askMargus({ stance: id });
                  }}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-medium disabled:opacity-40",
                    stance === id
                      ? "bg-brand/20 text-brand-bright"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {overrideCount > 0 && (
              <button
                type="button"
                onClick={onClearOverrides}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                title="Clear manual and Margus EOY overrides for this sheet"
              >
                <RotateCcw className="h-3 w-3" />
                Reset overrides ({overrideCount})
              </button>
            )}
            <button
              type="button"
              disabled={busy || model.rows.length === 0}
              onClick={() => void askMargus()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand/40 bg-brand/10 px-2.5 py-1.5 text-xs font-semibold text-brand-bright transition hover:border-brand/70 hover:bg-brand/15 disabled:opacity-40"
              title="Re-run the full Margus forecast for this sheet"
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {busy
                ? "Rethinking …"
                : plan
                  ? "Rerun forecast"
                  : "Ask Margus"}
            </button>
          </div>
        </div>
      </header>

      {model.rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-zinc-400">
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
                      {cashtag(r.ticker)}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {r.shares.toLocaleString("en-US")} shares
                      {!r.hasTargets && " · awaiting Margus"}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "text-sm font-medium tabular-nums",
                      r.gainPct != null
                        ? signedTone(r.gainPct)
                        : "text-zinc-400"
                    )}
                  >
                    {r.gainPct != null ? percent(r.gainPct) : "—"}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="text-center">
                    <p className="text-zinc-400">Current SP</p>
                    <p className="tabular-nums text-zinc-100">
                      {currency(r.currentPrice)}
                    </p>
                  </div>
                  {yearCols.map((y) => (
                    <div key={y} className="text-center">
                      <p
                        className={cn(
                          "text-zinc-400",
                          isCurrentYear(y) && "text-brand-bright"
                        )}
                      >
                        {yearLabel(y)}
                        {isCurrentYear(y) && " · now"}
                      </p>
                      <EoyPriceInput
                        value={r.eoyPrices[y]}
                        targeted={r.targetedYears[y]}
                        onCommit={(n) => onSetEoyPrice(r.ticker, y, n)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-3 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Portfolio value
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                {currency(model.currentTotal)}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {yearCols.map((y) => (
                  <div key={y}>
                    <p
                      className={cn(
                        "text-zinc-400",
                        isCurrentYear(y) && "text-brand-bright"
                      )}
                    >
                      {yearLabel(y)}
                      {isCurrentYear(y) && " · now"}
                    </p>
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
              <FluidRow className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                <div className={cellLabel}>Ticker</div>
                <div className={cellNum}>Current SP</div>
                {yearCols.map((y) => (
                  <div
                    key={y}
                    className={cn(
                      cellNum,
                      isCurrentYear(y) && "text-brand-bright"
                    )}
                    title={isCurrentYear(y) ? "This year" : undefined}
                  >
                    {yearLabel(y)}
                    {isCurrentYear(y) && " · now"}
                  </div>
                ))}
                <div className={cellNum}>Gain</div>
              </FluidRow>

              {model.rows.map((r) => (
                <FluidRow key={r.ticker} className="hover:bg-zinc-900/40">
                  <div className={cn(cellLabel, "font-semibold tracking-wide text-white")}>
                    {cashtag(r.ticker)}
                    {!r.hasTargets && (
                      <span className="mt-0.5 text-xs font-normal tracking-normal text-zinc-400">
                        awaiting Margus
                      </span>
                    )}
                  </div>
                  <div className={cn(cellNum, "text-zinc-100")}>
                    {currency(r.currentPrice)}
                  </div>
                  {yearCols.map((y) => (
                    <div key={y} className={cellNum}>
                      <EoyPriceInput
                        value={r.eoyPrices[y]}
                        targeted={r.targetedYears[y]}
                        onCommit={(n) => onSetEoyPrice(r.ticker, y, n)}
                      />
                    </div>
                  ))}
                  <div
                    className={cn(
                      cellNum,
                      "font-medium",
                      r.gainPct != null
                        ? signedTone(r.gainPct)
                        : "text-zinc-400"
                    )}
                  >
                    {r.gainPct != null ? percent(r.gainPct) : "—"}
                  </div>
                </FluidRow>
              ))}

              <FluidRow className="border-t border-zinc-700 bg-zinc-900/60 font-semibold">
                <div className={cn(cellLabel, "py-2.5 text-white")}>
                  Portfolio
                </div>
                <div className={cn(cellNum, "py-2.5 text-white")}>
                  {currency(model.currentTotal)}
                </div>
                {yearCols.map((y) => (
                  <div key={y} className={cn(cellNum, "py-2.5 text-white")}>
                    {currency(model.eoyTotals[y])}
                  </div>
                ))}
                <div
                  className={cn(
                    cellNum,
                    "py-2.5",
                    model.gainPct != null
                      ? signedTone(model.gainPct)
                      : "text-zinc-400"
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
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Margus plan · themes / trim / add / EOY path
          </h3>
          <p className="mt-0.5 text-xs text-zinc-400">
            Add / trim can be multiple names or sectors (SaaS, healthcare,
            drones …). Use Rerun forecast above anytime.
          </p>
          {plan?.generatedAt && (
            <p className="mt-1 text-xs text-zinc-400">
              Last generated {formatGeneratedAt(plan.generatedAt)}
              {appliedFlash ? " · prices applied" : ""}
            </p>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        )}

        {!plan && !busy && !error && (
          <div className="mt-3 rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center">
            <p className="text-sm text-zinc-400">
              Margus will reason an EOY price path for every holding
              automatically.
            </p>
          </div>
        )}

        {busy && !plan && (
          <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-brand-deep/30 bg-brand/5 px-4 py-6 text-sm text-brand-bright">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reasoning full EOY paths for this sheet …
          </div>
        )}
        {plan && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  General advice
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">
                  {plan.generalAdvice}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Sector rotation
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">
                  {plan.sectorRotation}
                </p>
              </div>
            </div>

            {(plan.eoyTargets?.length ?? 0) > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Margus EOY rationale
                </p>
                <ul className="mt-2 space-y-1.5">
                  {plan.eoyTargets.map((t) => (
                    <li
                      key={t.ticker}
                      className="text-xs leading-relaxed text-zinc-400"
                    >
                      <span className="font-semibold text-zinc-200">
                        {cashtag(t.ticker)}
                      </span>
                      {t.rationale ? `: ${t.rationale}` : ": path applied"}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {soldTickersInPlan.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-950/25 px-3 py-2.5 text-xs text-amber-100">
                <span>
                  This playbook may still name{" "}
                  {soldTickersInPlan.join(", ")}, no longer in this sheet.
                  {busy ? " Refreshing …" : ""}
                </span>
                {!busy && (
                  <button
                    type="button"
                    onClick={() => void askMargus()}
                    className="shrink-0 rounded-lg border border-amber-400/40 px-2.5 py-1 font-semibold text-amber-200 hover:bg-amber-500/10"
                  >
                    Regenerate now
                  </button>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plan.periods.map((s) => (
                <div
                  key={`${s.label}-${s.theme}`}
                  className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand/90">
                    {s.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {s.theme}
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="rounded-lg border border-brand/25 bg-brand/10 px-2.5 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-bright">
                        Add
                      </p>
                      <p className="mt-0.5 whitespace-normal break-words text-xs leading-snug text-zinc-100">
                        {s.add?.trim() || "Hold, no add"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-rose-500/25 bg-rose-950/30 px-2.5 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-rose-300">
                        Trim
                      </p>
                      <p className="mt-0.5 whitespace-normal break-words text-xs leading-snug text-zinc-100">
                        {s.trim?.trim() || "Hold, no trim"}
                      </p>
                    </div>
                  </div>
                  {s.notes?.trim() && (
                    <p className="mt-2 text-xs leading-relaxed text-zinc-400">
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
