"use client";

import { track } from "@vercel/analytics";
import { FluidRow, FluidTable } from "@/components/FluidTable";
import { Sparkline } from "@/components/Sparkline";
import {
  EmptyState,
  MicroLabel,
  PanelHeader,
  Segmented,
} from "@/components/ui/Panel";
import { FORECAST_DISCLAIMER } from "@/lib/disclaimer";
import { cn, signedTone, currency, percent, cashtag } from "@/lib/format";
import type { ForecastModel, ForecastYear } from "@/lib/forecast";
import {
  ensureCompleteEoyTargets,
  DEFAULT_FORECAST_STANCE,
  loadForecastPlan,
  loadPreviousForecastPlan,
  planEoyPaths,
  saveForecastPlan,
  shouldAutoRefreshForecast,
  forecastHoldingsKey,
  type ForecastPlan,
} from "@/lib/forecast-plan";
import type { ConvictionMap } from "@/lib/conviction";
import { readJsonOrThrow } from "@/lib/http";
import { countOverrides } from "@/lib/forecast-overrides";
import type { PortfolioEoyOverrides } from "@/lib/forecast-overrides";
import { isForecastFullyCovered } from "@/lib/forecast";
import { playbookBullets, type PlaybookBullet } from "@/lib/forecast-playbook";
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

function calibratedPaths(plan: ForecastPlan, model: ForecastModel) {
  const eoyTargets = ensureCompleteEoyTargets(model, plan.eoyTargets ?? []);
  return {
    eoyTargets,
    paths: planEoyPaths({
      ...plan,
      eoyTargets,
      stance: DEFAULT_FORECAST_STANCE,
    }),
  };
}

/** "EOY 2028" assumed the reader already knew the abbreviation. */
function yearLabel(year: number) {
  return `End ${year}`;
}

/** Current calendar year gets a "this year" cue so the nearest, most-actionable
 * target doesn't blend into the same-looking longer-horizon columns. */
function isCurrentYear(year: number) {
  return year === new Date().getFullYear();
}

function horizonTabLabel(label: string): string {
  const q = label.match(/Q([1-4])/i);
  if (/quarter/i.test(label) && q) return `Q${q[1]}`;
  const range = label.match(/(\d{4})\s*[–-]\s*(\d{2,4})/);
  if (range?.[1] && range[2]) {
    const end = range[2].length === 4 ? range[2].slice(2) : range[2];
    return `${range[1].slice(2)}-${end}`;
  }
  const y = label.match(/(20\d{2})/);
  return y?.[1] ?? label;
}

function PlaybookList({
  text,
  empty,
  tone,
}: {
  text: string | undefined;
  empty: string;
  tone: "add" | "trim";
}) {
  const items = playbookBullets(text);
  if (items.length === 0) {
    return <p className="mt-1.5 text-sm text-zinc-500">{empty}</p>;
  }
  return (
    <ul className="mt-1.5 space-y-2.5">
      {items.map((item, i) => (
        <PlaybookItem key={`${item.head}-${i}`} item={item} tone={tone} />
      ))}
    </ul>
  );
}

function PlaybookItem({
  item,
  tone,
}: {
  item: PlaybookBullet;
  tone: "add" | "trim";
}) {
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden
        className={cn(
          "mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full",
          tone === "add" ? "bg-brand-bright" : "bg-rose-400"
        )}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug text-zinc-100">
          {item.head}
        </p>
        {item.detail && (
          <p className="mt-0.5 text-sm leading-snug text-zinc-400">
            {item.detail}
          </p>
        )}
      </div>
    </li>
  );
}

export function ForecastOffStub({ onShow }: { onShow: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">Forecast is off</p>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
          Margus&apos;s year-by-year path for this sheet. Same idea as Pulse,
          sitting under the table.
        </p>
      </div>
      <button
        type="button"
        onClick={onShow}
        className="shrink-0 rounded-lg bg-brand/20 px-3 py-1.5 text-xs font-semibold text-brand-bright hover:bg-brand/30"
      >
        Show
      </button>
    </div>
  );
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
  const [prevPlan, setPrevPlan] = useState<ForecastPlan | null>(null);
  const [horizon, setHorizon] = useState(0);
  const planAt = plan?.generatedAt ?? "";
  useEffect(() => {
    if (!planHydrated) {
      setPrevPlan(null);
      return;
    }
    setPrevPlan(loadPreviousForecastPlan(portfolioId));
  }, [planHydrated, portfolioId, planAt]);

  useEffect(() => {
    setHorizon(0);
  }, [planAt]);

  useEffect(() => {
    setPlanHydrated(false);
    const loaded = loadForecastPlan(portfolioId);
    setPlan(loaded);
    setError(null);
    setAppliedFlash(false);
    autoKeyRef.current = "";
    reappliedRef.current = "";
    calibrateKeyRef.current = "";
    setPlanHydrated(true);
  }, [portfolioId]);

  async function askMargus(opts?: { auto?: boolean }) {
    if (askInFlight.current) return;
    askInFlight.current = true;
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
        stance: DEFAULT_FORECAST_STANCE,
      };
      const { eoyTargets, paths } = calibratedPaths(next, model);
      const calibrated: ForecastPlan = {
        ...next,
        eoyTargets,
        stance: DEFAULT_FORECAST_STANCE,
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
    });
    if (!decision.run) return;
    const key = `${portfolioId}:${holdingsKey}:${decision.reason}:${plan?.generatedAt ?? "none"}`;
    if (autoKeyRef.current === key) return;
    autoKeyRef.current = key;
    void askMargus({ auto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated auto refresh
  }, [planHydrated, portfolioId, holdingsKey, plan, fullyCovered, model.rows.length, busy]);

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

  const lastPlanDiffs = useMemo(() => {
    if (!plan || !prevPlan?.eoyTargets?.length) return [];
    const lastYear = yearCols[yearCols.length - 1];
    if (lastYear == null) return [];
    const out: { ticker: string; from: number; to: number }[] = [];
    for (const t of plan.eoyTargets) {
      const old = prevPlan.eoyTargets.find(
        (p) => p.ticker.toUpperCase() === t.ticker.toUpperCase()
      );
      if (!old) continue;
      const nextP = t.prices?.[lastYear];
      const oldP = old.prices?.[lastYear];
      if (
        typeof nextP !== "number" ||
        typeof oldP !== "number" ||
        Math.abs(nextP - oldP) < 0.5
      ) {
        continue;
      }
      out.push({ ticker: t.ticker, from: oldP, to: nextP });
    }
    return out;
  }, [plan, prevPlan, yearCols]);

  const activePeriod =
    plan && plan.periods.length > 0
      ? plan.periods[Math.min(horizon, plan.periods.length - 1)]
      : null;

  const statusHint = useMemo(() => {
    if (!planHydrated || model.rows.length === 0 || busy) return null;
    const decision = shouldAutoRefreshForecast({
      plan,
      tickers: model.rows.map((r) => r.ticker),
      fullyCovered,
    });
    if (decision.run && decision.reason === "first-run") {
      return "First time on this sheet, Margus is working out the prices …";
    }
    if (decision.run && decision.reason === "monthly") {
      return "Monthly check, Margus is seeing whether anything has changed …";
    }
    if (decision.run && decision.reason === "sold-holding") {
      return "You sold something this covered, Margus is redoing it …";
    }
    if (decision.run && decision.reason === "rebase") {
      return "Updating this to the base case …";
    }
    return null;
  }, [planHydrated, model.rows, plan, fullyCovered, busy]);

  return (
    <section className="overflow-hidden rounded-2xl border border-brand-deep/30 bg-card/80">
      <header className="border-b border-zinc-800/80 p-5 sm:p-8">
        <PanelHeader
          title="Forecast"
          subtitle="A yearly price for each holding, to 2030."
          actions={
            <>
              {overrideCount > 0 && (
                <button
                  type="button"
                  onClick={onClearOverrides}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
                  title="Throw away every price you or Margus changed on this sheet"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden />
                  Undo my changes ({overrideCount})
                </button>
              )}
              <button
                type="button"
                disabled={busy || model.rows.length === 0}
                onClick={() => void askMargus()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand/40 bg-brand/10 px-2.5 py-1.5 text-xs font-semibold text-brand-bright transition hover:border-brand/70 hover:bg-brand/15 disabled:opacity-40"
                title="Work the whole forecast out again from scratch"
              >
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-3 w-3" aria-hidden />
                )}
                {busy ? "Thinking …" : plan ? "Work it out again" : "Ask Margus"}
              </button>
            </>
          }
        />
        <p className="mt-3 text-xs leading-relaxed text-zinc-400">
          {FORECAST_DISCLAIMER}
        </p>
        {statusHint && (
          <p className="mt-1 text-xs text-amber-200/80">{statusHint}</p>
        )}
        {flatCount > 0 && !busy && !plan && !statusHint && (
          <p className="mt-1 text-xs text-amber-200/80">
            No forecast saved yet. Margus is working on it.
          </p>
        )}
        {busy && (
          <p className="mt-1 text-xs text-amber-200/80">
            Margus is updating the forecast …
          </p>
        )}
        {model.rows.length > 0 && (
          <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-3">
            <MicroLabel>Sheet path</MicroLabel>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <Sparkline
                points={[
                  model.currentTotal,
                  ...yearCols.map((y) => model.eoyTotals[y]),
                ]}
                width={140}
                height={40}
              />
              <div className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-zinc-400">
                <span>Now {currency(model.currentTotal, 0)}</span>
                {yearCols.map((y) => (
                  <span key={y}>
                    {y} {currency(model.eoyTotals[y], 0)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      {model.rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-zinc-400">
          Add a holding and Margus will work out where it could go.
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
                      {!r.hasTargets && " · Margus is working on it"}
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
                    <p className="text-zinc-400">Price now</p>
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
                Whole sheet
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
                <div className={cellNum}>Price now</div>
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
                <div className={cellNum}>Change</div>
              </FluidRow>

              {model.rows.map((r) => (
                <FluidRow key={r.ticker} className="hover:bg-zinc-900/40">
                  <div className={cn(cellLabel, "font-semibold tracking-wide text-white")}>
                    {cashtag(r.ticker)}
                    {!r.hasTargets && (
                      <span className="mt-0.5 text-xs font-normal tracking-normal text-zinc-400">
                        working on it
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

      <div className="border-t border-zinc-800/80 p-4 sm:p-6">
        <div>
          <h3 className="text-base font-semibold text-white">
            What Margus makes of it
          </h3>
          {plan?.generatedAt && (
            <p className="mt-1 text-xs text-zinc-500">
              Worked out {formatGeneratedAt(plan.generatedAt)}
              {appliedFlash ? " · prices updated" : ""}
            </p>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        )}

        {!plan && !busy && !error && (
          <EmptyState
            className="mt-3"
            title="Margus hasn't weighed in yet"
            detail="He works out a price path for every holding on his own. Nothing for you to do."
          />
        )}

        {busy && !plan && (
          <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-brand-deep/30 bg-brand/5 px-4 py-6 text-sm text-brand-bright">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Working through every holding on this sheet …
          </div>
        )}
        {plan && (
          <div className="mt-5 space-y-8">
            {(plan.generalAdvice || plan.sectorRotation) && (
              <div className="space-y-2 text-sm leading-relaxed">
                {plan.generalAdvice && (
                  <p className="text-zinc-200">{plan.generalAdvice}</p>
                )}
                {plan.sectorRotation && (
                  <p className="text-zinc-400">{plan.sectorRotation}</p>
                )}
              </div>
            )}

            {(plan.eoyTargets?.length ?? 0) > 0 && (
              <div>
                <MicroLabel>Why each number</MicroLabel>
                <ul className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  {plan.eoyTargets.map((t) => (
                    <li key={t.ticker} className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-100">
                        {cashtag(t.ticker)}
                      </p>
                      {t.rationale ? (
                        <p className="mt-0.5 text-sm leading-snug text-zinc-400">
                          {t.rationale}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {lastPlanDiffs.length > 0 && (
              <div>
                <MicroLabel>Vs last plan</MicroLabel>
                <ul className="mt-2 space-y-1 text-sm text-zinc-400">
                  {lastPlanDiffs.map((d) => (
                    <li key={d.ticker}>
                      <span className="font-semibold text-zinc-200">
                        {cashtag(d.ticker)}
                      </span>
                      {` end ${yearCols[yearCols.length - 1]}: ${currency(d.from, 0)} to ${currency(d.to, 0)}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {soldTickersInPlan.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-950/25 px-3 py-2.5 text-xs text-amber-100">
                <span>
                  This still mentions {soldTickersInPlan.join(", ")}, which you
                  no longer hold here.
                  {busy ? " Updating …" : ""}
                </span>
                {!busy && (
                  <button
                    type="button"
                    onClick={() => void askMargus()}
                    className="shrink-0 rounded-lg border border-amber-400/40 px-2.5 py-1 font-semibold text-amber-200 transition hover:bg-amber-500/10"
                  >
                    Update it
                  </button>
                )}
              </div>
            )}

            {activePeriod && (
              <div>
                <MicroLabel>Where he&apos;d add or trim</MicroLabel>
                {plan.periods.length > 1 && (
                  <div className="mt-3">
                    <Segmented
                      options={plan.periods.map((p, i) => ({
                        id: String(i),
                        label: horizonTabLabel(p.label),
                        title: p.label,
                      }))}
                      value={String(
                        Math.min(horizon, plan.periods.length - 1)
                      )}
                      onChange={(id) => setHorizon(Number(id))}
                      ariaLabel="Forecast horizon"
                      className="max-w-full flex-wrap"
                    />
                  </div>
                )}
                <div className="mt-4">
                  <p className="text-sm font-semibold text-white">
                    {activePeriod.theme}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {activePeriod.label}
                  </p>
                  <div className="mt-4 grid gap-6 sm:grid-cols-2">
                    <div>
                      <MicroLabel className="text-brand-bright">
                        Worth adding
                      </MicroLabel>
                      <PlaybookList
                        text={activePeriod.add}
                        empty="Nothing to add"
                        tone="add"
                      />
                    </div>
                    <div>
                      <MicroLabel className="text-rose-300">
                        Worth trimming
                      </MicroLabel>
                      <PlaybookList
                        text={activePeriod.trim}
                        empty="Nothing to trim"
                        tone="trim"
                      />
                    </div>
                  </div>
                  {activePeriod.notes?.trim() && (
                    <p className="mt-4 text-sm leading-relaxed text-zinc-500">
                      {activePeriod.notes}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
