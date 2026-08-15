"use client";

import { track } from "@vercel/analytics";
import { FluidRow, FluidTable } from "@/components/FluidTable";
import {
  EmptyState,
  MicroLabel,
  PanelHeader,
  Segmented,
} from "@/components/ui/Panel";
import { FORECAST_DISCLAIMER } from "@/lib/disclaimer";
import { isAbortError } from "@/lib/abort";
import {
  cn,
  signedTone,
  currency,
  percent,
  signedCurrency,
  cashtag,
} from "@/lib/format";
import { compactAxis, niceScale } from "@/components/mobile/GoldNavChart";
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
  bookConvictionKey,
  cachedEoyPathsFor,
  cachedTickersFor,
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
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

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
  /** False until Lab conviction has loaded. Auto-run waits so a late
   * hydrate cannot look like a missing cache and fire the model. */
  labReady?: boolean;
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

/** Current calendar year is still an EOY column (Dec 31), not "now". */
function isCurrentYear(year: number) {
  return year === new Date().getFullYear();
}

function YearColHeader({ year }: { year: number }) {
  return yearLabel(year);
}

function mergeEoyPaths(
  ...lists: { ticker: string; prices: Partial<Record<ForecastYear, number>> }[][]
) {
  const map = new Map<
    string,
    { ticker: string; prices: Partial<Record<ForecastYear, number>> }
  >();
  for (const list of lists) {
    for (const p of list) {
      map.set(p.ticker.toUpperCase(), p);
    }
  }
  return [...map.values()];
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

type SheetPathPoint = { label: string; value: number };

function SheetPathChart({ points }: { points: SheetPathPoint[] }) {
  const gid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const width = 640;
  const height = 176;
  const padL = 8;
  const padR = 12;
  const padT = 12;
  const padB = 8;
  const usable = useMemo(
    () => points.filter((p) => Number.isFinite(p.value) && p.value > 0),
    [points]
  );

  useEffect(() => {
    if (!pinned) return;
    function onDoc(e: Event) {
      if (svgRef.current?.contains(e.target as Node)) return;
      setPinned(false);
      setActive(null);
    }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [pinned]);

  const geometry = useMemo(() => {
    if (usable.length < 2) return null;
    const vals = usable.map((p) => p.value);
    const scale = niceScale(Math.min(...vals), Math.max(...vals), 5);
    const axisSpan = scale.max - scale.min || 1;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const lastIdx = usable.length - 1;
    const xAt = (i: number) =>
      padL + (lastIdx === 0 ? innerW / 2 : (i / lastIdx) * innerW);
    const yAt = (v: number) => padT + (1 - (v - scale.min) / axisSpan) * innerH;
    const line = usable
      .map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`)
      .join(" ");
    const area = `${xAt(0).toFixed(1)},${(padT + innerH).toFixed(1)} ${line} ${xAt(lastIdx).toFixed(1)},${(padT + innerH).toFixed(1)}`;
    return { ...scale, innerW, innerH, lastIdx, xAt, yAt, line, area };
  }, [usable]);

  if (!geometry) return null;

  const { ticks, innerW, innerH, lastIdx, xAt, yAt, line, area } = geometry;
  const start = usable[0]!.value;
  const hover =
    active != null && active >= 0 && active <= lastIdx ? active : null;
  const hoverPoint = hover != null ? usable[hover] : null;
  const vsNowPct =
    hoverPoint && start > 0 ? (hoverPoint.value - start) / start : null;
  const vsNowDollar =
    hoverPoint && start > 0 ? hoverPoint.value - start : null;

  function indexFromClientX(clientX: number, target: SVGSVGElement) {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || lastIdx <= 0) return 0;
    const x = ((clientX - rect.left) / rect.width) * width;
    const t = (x - padL) / innerW;
    return Math.max(0, Math.min(lastIdx, Math.round(t * lastIdx)));
  }

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(indexFromClientX(e.clientX, e.currentTarget));
    if (e.pointerType !== "mouse") setPinned(true);
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const dragging = e.currentTarget.hasPointerCapture(e.pointerId);
    if (e.pointerType === "mouse" || dragging) {
      setActive(indexFromClientX(e.clientX, e.currentTarget));
    }
  }

  function onPointerLeave(e: PointerEvent<SVGSVGElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) return;
    if (!pinned) setActive(null);
  }

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setPinned(true);
    setActive((prev) => {
      const cur = prev ?? lastIdx;
      return e.key === "ArrowLeft"
        ? Math.max(0, cur - 1)
        : Math.min(lastIdx, cur + 1);
    });
  }

  return (
    <div>
      <div className="mb-2 flex min-h-[4.75rem] items-center justify-center pl-11">
        {hoverPoint ? (
          <div className="rounded-lg border border-white/10 bg-zinc-950/90 px-2.5 py-1.5 text-center">
            <p className="text-xs text-zinc-400">{hoverPoint.label}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-white">
              {currency(hoverPoint.value, 0)}
            </p>
            {vsNowPct != null && vsNowDollar != null && (
              <p
                className={cn(
                  "mt-0.5 text-xs tabular-nums",
                  signedTone(vsNowPct)
                )}
              >
                vs now {vsNowPct > 0 ? "+" : ""}
                {percent(vsNowPct)}
                <span className="text-zinc-500">
                  {" "}
                  · {signedCurrency(vsNowDollar, 0)}
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="pb-1 text-xs text-zinc-500">
            Drag across to read a year
          </p>
        )}
      </div>

      <div className="flex items-stretch gap-3">
        <div className="relative w-11 shrink-0">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 text-xs tabular-nums text-zinc-500"
              style={{ top: `${(yAt(t) / height) * 100}%` }}
            >
              {compactAxis(t)}
            </span>
          ))}
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto min-w-0 flex-1 cursor-crosshair touch-none select-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50"
          role="slider"
          tabIndex={0}
          aria-label="Modeled book value through the last forecast year. Drag or use arrow keys to read a year."
          aria-valuemin={0}
          aria-valuemax={lastIdx}
          aria-valuenow={hover ?? lastIdx}
          aria-valuetext={
            hoverPoint
              ? `${hoverPoint.label}, ${currency(hoverPoint.value, 0)}${
                  vsNowPct != null ? `, vs now ${percent(vsNowPct)}` : ""
                }`
              : undefined
          }
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onKeyDown={onKeyDown}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#D6AD69" stopOpacity="0.28" />
              <stop offset="1" stopColor="#D6AD69" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <line
              key={t}
              x1={padL}
              x2={width - padR}
              y1={yAt(t)}
              y2={yAt(t)}
              stroke="currentColor"
              strokeOpacity={0.1}
            />
          ))}
          <polygon points={area} fill={`url(#${gid})`} />
          <polyline
            fill="none"
            stroke="#D6AD69"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={line}
          />
          {usable.map((p, i) => (
            <circle
              key={p.label}
              cx={xAt(i)}
              cy={yAt(p.value)}
              r={2.5}
              fill="#08090C"
              stroke="#E8C989"
              strokeWidth={1.5}
            />
          ))}
          {hover != null && hoverPoint && (
            <g pointerEvents="none">
              <line
                x1={xAt(hover)}
                x2={xAt(hover)}
                y1={padT}
                y2={padT + innerH}
                stroke="#E8C989"
                strokeOpacity={0.45}
              />
              <circle
                cx={xAt(hover)}
                cy={yAt(hoverPoint.value)}
                r={4.5}
                fill="#E8C989"
                stroke="#08090C"
                strokeWidth={1.5}
              />
            </g>
          )}
        </svg>
      </div>
      <div className="mt-1.5 flex">
        <div className="w-11 shrink-0" />
        <div className="relative h-4 min-w-0 flex-1">
          {usable.map((p, i) => {
            const isFirst = i === 0;
            const isLast = i === lastIdx;
            return (
              <span
                key={p.label}
                className="absolute top-0 text-xs text-zinc-500"
                style={{
                  left: `${((xAt(i) - padL) / innerW) * 100}%`,
                  transform: isFirst
                    ? "translateX(0)"
                    : isLast
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
                }}
              >
                {p.label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SheetPath({
  now,
  years,
  totals,
}: {
  now: number;
  years: readonly ForecastYear[];
  totals: Record<ForecastYear, number>;
}) {
  const points: SheetPathPoint[] = [
    { label: "Now", value: now },
    ...years.map((y) => ({ label: String(y), value: totals[y] })),
  ];

  return (
    <div className="mt-4 border-t border-white/5 pt-4">
      <SheetPathChart points={points} />
    </div>
  );
}

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
  labReady = true,
}: Props) {
  const yearCols = model.years;
  const mobileYears = yearCols.filter((y) => y !== 2030);
  function mustBeTrue(ticker: string): string {
    return (
      cachedEoyPathsFor([ticker], convictions)[0]?.rationale?.trim() ||
      convictions?.[ticker]?.thesis?.trim() ||
      ""
    );
  }
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
  const [planHydrated, setPlanHydrated] = useState(false);
  const overrideCount = countOverrides(overrides);
  const flatCount = model.rows.filter((r) => !r.hasTargets).length;
  const rowTickers = useMemo(
    () => model.rows.map((r) => r.ticker),
    [model.rows]
  );
  const holdingsKey = forecastHoldingsKey(rowTickers);
  const convictionKey = bookConvictionKey(rowTickers, convictions);
  // Memoized on the stable keys rather than recomputed inline: this feeds a
  // useMemo below, and a fresh array every render made that memo recompute
  // every render, which is the same as not having it.
  const cachedTickers = useMemo(
    () => (planHydrated ? cachedTickersFor(rowTickers, convictions) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- convictionKey stands in for `convictions`
    [planHydrated, rowTickers, convictionKey]
  );
  const fullyCovered = isForecastFullyCovered(rowTickers, overrides);
  const autoKeyRef = useRef<string>("");
  const reappliedRef = useRef<string>("");
  const calibrateKeyRef = useRef<string>("");
  const askInFlight = useRef(false);
  const askAbortRef = useRef<AbortController | null>(null);
  const askGenRef = useRef(0);
  const planRef = useRef<ForecastPlan | null>(null);
  planRef.current = plan;
  useEffect(() => {
    return () => {
      askAbortRef.current?.abort();
      askGenRef.current += 1;
    };
  }, []);
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

  useLayoutEffect(() => {
    askAbortRef.current?.abort();
    askGenRef.current += 1;
    askInFlight.current = false;
    setBusy(false);
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
    askAbortRef.current?.abort();
    const ctrl = new AbortController();
    askAbortRef.current = ctrl;
    const gen = ++askGenRef.current;
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
        signal: ctrl.signal,
      });
      const data = await readJsonOrThrow<{ plan: ForecastPlan }>(
        res,
        "Couldn't build a forecast. Try again."
      );
      if (askGenRef.current !== gen || ctrl.signal.aborted) return;
      const convictionKey = bookConvictionKey(
        model.rows.map((r) => r.ticker),
        convictions
      );
      const next: ForecastPlan = {
        ...(data.plan as ForecastPlan),
        holdingsKey,
        convictionKey,
        stance: DEFAULT_FORECAST_STANCE,
      };
      const { eoyTargets, paths } = calibratedPaths(next, model);
      const calibrated: ForecastPlan = {
        ...next,
        eoyTargets,
        stance: DEFAULT_FORECAST_STANCE,
      };
      saveForecastPlan(calibrated, convictions);
      setPlan(calibrated);

      if (paths.length > 0) {
        onApplyMargusPaths(paths);
        setAppliedFlash(true);
      }
      autoKeyRef.current = `${portfolioId}:${holdingsKey}:${calibrated.generatedAt}`;
      reappliedRef.current = `${portfolioId}:${holdingsKey}:reapply`;
      calibrateKeyRef.current = `${portfolioId}:${holdingsKey}`;
    } catch (err) {
      if (isAbortError(err) || askGenRef.current !== gen) return;
      // A failed background refresh must not hide a writeup we already have.
      if (opts?.auto && planRef.current) return;
      setError(err instanceof Error ? err.message : "Couldn't build a forecast. Try again.");
      // Keep autoKeyRef set so a failed auto-run does not immediately
      // fire again. Clearing it used to retry in a tight loop, which
      // burned the forecast rate limit and left Thinking stuck on.
    } finally {
      if (askGenRef.current === gen) {
        askInFlight.current = false;
        setBusy(false);
      }
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
    saveForecastPlan(next, convictions);
    setPlan(next);
    if (paths.length > 0) {
      onApplyMargusPaths(paths);
      reappliedRef.current = `${portfolioId}:${holdingsKey}:reapply`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one calibrate pass per sheet/holdings
  }, [portfolioId, holdingsKey, plan, model.rows.length, flatCount]);

  // Restore saved Margus prices into the grid without calling the model.
  // Shared ticker cache fills another sheet's empty cells (Anu gets Aasad's
  // NBIS path) so opening a second book does not fire a new run.
  useEffect(() => {
    if (model.rows.length === 0) return;
    if (flatCount === 0) return;
    const key = `${portfolioId}:${holdingsKey}:reapply`;
    if (reappliedRef.current === key) return;
    reappliedRef.current = key;
    const planPaths = plan
      ? calibratedPaths(plan, model).paths
      : [];
    const cachePaths = cachedEoyPathsFor(
      model.rows.map((r) => r.ticker),
      convictions
    );
    const merged = mergeEoyPaths(cachePaths, planPaths);
    if (merged.length > 0) onApplyMargusPaths(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once per sheet/holdings
  }, [portfolioId, holdingsKey, flatCount, plan]);

  // Auto: first run with nothing cached, or a new ticker with no shared path.
  // Cached reasoning is reused across sheets. Convictions loading in later
  // is not a reason to call the model again.
  useEffect(() => {
    if (!labReady || !planHydrated || model.rows.length === 0) return;
    if (askInFlight.current || busy) return;
    const decision = shouldAutoRefreshForecast({
      plan,
      tickers: model.rows.map((r) => r.ticker),
      fullyCovered,
      cachedTickers,
    });
    if (!decision.run) return;
    const key = `${portfolioId}:${holdingsKey}:${decision.reason}:${plan?.generatedAt ?? "none"}`;
    if (autoKeyRef.current === key) return;
    autoKeyRef.current = key;
    void askMargus({ auto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated auto refresh
  }, [labReady, planHydrated, portfolioId, holdingsKey, plan, fullyCovered, model.rows.length, busy, cachedTickers.join("|")]);

  // If a sold ticker is still named in the playbook, say so. The model
  // does not auto-rerun for that; use "Work it out again" when you want
  // the writeup to drop the old name.
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
    if (!labReady || !planHydrated || model.rows.length === 0 || busy) return null;
    const decision = shouldAutoRefreshForecast({
      plan,
      tickers: model.rows.map((r) => r.ticker),
      fullyCovered,
      cachedTickers,
    });
    if (decision.run && decision.reason === "first-run") {
      return "First time on this sheet, Margus is working out the prices …";
    }
    if (decision.run && decision.reason === "new-holding") {
      return "New holding, Margus is working out a path …";
    }
    return null;
  }, [labReady, planHydrated, model.rows, plan, fullyCovered, busy, cachedTickers]);

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
        {busy && (
          <p className="mt-1 text-xs text-amber-200/80">
            Margus is updating the forecast …
          </p>
        )}
        {error && (
          <p className="mt-1 text-xs text-rose-300">{error}</p>
        )}
        {model.rows.length > 0 && (
          <SheetPath
            now={model.currentTotal}
            years={yearCols}
            totals={model.eoyTotals}
          />
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
                    {mustBeTrue(r.ticker) ? (
                      <p className="mt-1 text-xs leading-snug text-zinc-400">
                        {mustBeTrue(r.ticker)}
                      </p>
                    ) : null}
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
                  {mobileYears.map((y) => (
                    <div key={y} className="text-center">
                      <p
                        className={cn(
                          "text-zinc-400",
                          isCurrentYear(y) && "text-brand-bright"
                        )}
                      >
                        <YearColHeader year={y} />
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
                {mobileYears.map((y) => (
                  <div key={y}>
                    <p
                      className={cn(
                        "text-zinc-400",
                        isCurrentYear(y) && "text-brand-bright"
                      )}
                    >
                      <YearColHeader year={y} />
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
                    "mt-3 hidden text-sm font-medium tabular-nums md:block",
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
                    title={isCurrentYear(y) ? "Year-end, not today's price" : undefined}
                  >
                    <YearColHeader year={y} />
                  </div>
                ))}
                <div className={cellNum}>Change</div>
              </FluidRow>

              {model.rows.map((r) => (
                <FluidRow key={r.ticker} className="min-h-[2.75rem] hover:bg-zinc-900/40">
                  <div className={cn(cellLabel, "font-semibold tracking-wide text-white")}>
                    {cashtag(r.ticker)}
                    {!r.hasTargets && (
                      <span className="mt-0.5 text-xs font-normal tracking-normal text-zinc-400">
                        working on it
                      </span>
                    )}
                    {mustBeTrue(r.ticker) ? (
                      <span className="mt-1 max-w-[12rem] text-xs font-normal leading-snug tracking-normal text-zinc-400">
                        {mustBeTrue(r.ticker)}
                      </span>
                    ) : null}
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
                    <div className="flex h-full flex-col">
                      <MicroLabel className="text-brand-bright">
                        Worth adding
                      </MicroLabel>
                      <PlaybookList
                        text={activePeriod.add}
                        empty="Nothing to add"
                        tone="add"
                      />
                    </div>
                    <div className="flex h-full flex-col">
                      <MicroLabel className="text-rose-300">
                        Worth selling some
                      </MicroLabel>
                      <PlaybookList
                        text={activePeriod.trim}
                        empty="Nothing to sell"
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
