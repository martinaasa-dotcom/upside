"use client";

import {
  calculateCompound,
  COMPOUND_STORAGE_KEY,
  DEFAULT_COMPOUND_INPUTS,
  type CompoundInputs,
  type ContributionFrequency,
  type ContributionMode,
  type RatePeriod,
} from "@/lib/compound-interest";
import {
  buildCompareScenarios,
  buildCompareTakeaway,
  buildCompoundMilestones,
  buildMilestoneTakeaway,
  buildNarrative,
  buildYearStories,
  calculateWithShock,
  COMPOUND_CASH_YIELD_ANNUAL_PCT,
  findTippingYear,
  formatMilestoneDate,
  loadMilestoneActuals,
  saveMilestoneActuals,
  stayTheCourseInputs,
  storyYears,
  type MilestoneActuals,
  type ShockKind,
} from "@/lib/compound-play";
import { blendedExpectedAnnualReturn } from "@/lib/forecast-conviction";
import { cn } from "@/lib/format";
import {
  displayToUsd,
  formatEurUsdHint,
  loadCompoundCurrency,
  saveCompoundCurrency,
  usdToDisplay,
  type DisplayCurrency,
  type EurUsdQuote,
} from "@/lib/display-currency";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import {
  ArrowUpRight,
  Calculator,
  CheckCircle2,
  Copy,
  Share2,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

type CurrencyCode = DisplayCurrency;

const CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: "USD", label: "USD" },
  { code: "EUR", label: "EUR" },
];

export type CompoundSheetOption = {
  id: string;
  name: string;
  value: number;
};

type Props = {
  /** Book value in USD */
  bookValue: number;
  /** Sheet values in USD */
  sheets: CompoundSheetOption[];
  /** Per-ticker book-wide value in USD — used only to derive a default
   * interest rate from what's actually held (see blendedExpectedAnnualReturn),
   * different for every person instead of one fixed number for everyone. */
  tickerValues?: Array<{ ticker: string; value: number }>;
  /** Book-wide cash in USD, for the same blended-rate calculation. */
  bookCash?: number;
  /** USD per 1 EUR (Yahoo EURUSD) */
  eurUsd?: number | null;
  eurUsdDetail?: EurUsdQuote | null;
};

function loadStored(): CompoundInputs {
  if (typeof window === "undefined") return DEFAULT_COMPOUND_INPUTS;
  try {
    const raw = localStorage.getItem(COMPOUND_STORAGE_KEY);
    if (!raw) return DEFAULT_COMPOUND_INPUTS;
    return {
      ...DEFAULT_COMPOUND_INPUTS,
      ...JSON.parse(raw),
      compound: "monthly",
    };
  } catch {
    return DEFAULT_COMPOUND_INPUTS;
  }
}

function money(
  amountUsd: number,
  currency: CurrencyCode,
  eurUsd: number | null,
  digits = 0
): string {
  const shown = usdToDisplay(amountUsd, currency, eurUsd);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(shown);
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1.5 text-xs font-medium transition",
        active
          ? "bg-brand/20 text-brand-bright ring-1 ring-inset ring-brand/40"
          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
      )}
    >
      {children}
    </button>
  );
}

function DualPathChart({
  stay,
  active,
  currency,
  eurUsd,
  tippingYear,
}: {
  stay: number[];
  active: number[];
  currency: CurrencyCode;
  eurUsd: number | null;
  tippingYear: number | null;
}) {
  // A native SVG <title> only works on mouse hover (no touch support, and
  // a ~1s delay even on desktop) — swap it for a real, instant, touch-
  // friendly tooltip that follows the data point. Anchored to the
  // viewBox coordinates of the hovered point (not raw cursor pixels), so
  // its position as a % of the SVG box is correct regardless of how wide
  // the responsive SVG actually renders.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const max = Math.max(...stay, ...active, 1);
  const w = 640;
  const h = 240;
  const padL = 52;
  const padR = 16;
  const padT = 16;
  const padB = 24;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const lastIdx = Math.max(active.length - 1, 1);

  const xAt = (i: number) => padL + (i / lastIdx) * plotW;
  const yAt = (v: number) => padT + plotH - (v / max) * plotH;

  function updateHoverFromClientX(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * w;
    const idx = Math.round(((relX - padL) / plotW) * lastIdx);
    setHoverIdx(Math.max(0, Math.min(lastIdx, idx)));
  }

  const toPoints = (series: number[]) =>
    series.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");

  // Fill the gap between the two lines so the compounding edge is
  // something you see, not just two lines you have to mentally subtract.
  const gapArea = (() => {
    const top = active.map((v, i) => `${xAt(i)},${yAt(v)}`);
    const bottomRev = [...stay].map((v, i) => `${xAt(i)},${yAt(v)}`).reverse();
    return [...top, ...bottomRev].join(" ");
  })();

  const gridSteps = [0, 0.25, 0.5, 0.75, 1];
  const compact = (n: number) => {
    const shown = money(n, currency, eurUsd, 0);
    return shown.length > 9 ? shown.replace(/\.00$/, "") : shown;
  };

  // A handful of x-axis year labels — every year would collide on a long
  // horizon, so space them out to roughly 5-6 ticks.
  const yearTickEvery = Math.max(1, Math.round(lastIdx / 5));
  const yearTicks = Array.from(
    { length: Math.floor(lastIdx / yearTickEvery) + 1 },
    (_, k) => k * yearTickEvery
  );
  if (yearTicks[yearTicks.length - 1] !== lastIdx) yearTicks.push(lastIdx);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label="Stay the course vs active path"
        onMouseMove={(e) => updateHoverFromClientX(e.clientX)}
        onMouseLeave={() => setHoverIdx(null)}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (t) updateHoverFromClientX(t.clientX);
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (t) updateHoverFromClientX(t.clientX);
        }}
        onTouchEnd={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="dualPathGap" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {gridSteps.map((s) => {
          const y = padT + plotH - s * plotH;
          return (
            <g key={s}>
              <line
                x1={padL}
                x2={w - padR}
                y1={y}
                y2={y}
                stroke="#27272a"
                strokeWidth="1"
              />
              <text
                x={padL - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="9"
                fill="#71717a"
              >
                {compact(max * s)}
              </text>
            </g>
          );
        })}

        {yearTicks.map((i) => (
          <text
            key={i}
            x={xAt(i)}
            y={h - 6}
            textAnchor="middle"
            fontSize="9"
            fill="#71717a"
          >
            Y{i}
          </text>
        ))}

        <polygon points={gapArea} fill="url(#dualPathGap)" />

        {tippingYear != null && tippingYear <= lastIdx && (
          <g>
            <line
              x1={xAt(tippingYear)}
              x2={xAt(tippingYear)}
              y1={padT}
              y2={padT + plotH}
              stroke="#34d399"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.6"
            />
            <text
              x={xAt(tippingYear)}
              y={padT - 4}
              textAnchor="middle"
              fontSize="9"
              fontWeight="600"
              fill="#34d399"
            >
              Tip Y{tippingYear}
            </text>
          </g>
        )}

        <polyline
          points={toPoints(stay)}
          fill="none"
          stroke="#71717a"
          strokeWidth="2"
          strokeDasharray="6 4"
        />
        <polyline
          points={toPoints(active)}
          fill="none"
          stroke="#34d399"
          strokeWidth="2.5"
        />

        {hoverIdx != null && (
          <g pointerEvents="none">
            <line
              x1={xAt(hoverIdx)}
              x2={xAt(hoverIdx)}
              y1={padT}
              y2={padT + plotH}
              stroke="#a1a1aa"
              strokeWidth="1"
              strokeDasharray="2 3"
              opacity="0.7"
            />
            <circle
              cx={xAt(hoverIdx)}
              cy={yAt(active[hoverIdx] ?? 0)}
              r="4"
              fill="#34d399"
              stroke="#0a0a0b"
              strokeWidth="1.5"
            />
            <circle
              cx={xAt(hoverIdx)}
              cy={yAt(stay[hoverIdx] ?? 0)}
              r="4"
              fill="#71717a"
              stroke="#0a0a0b"
              strokeWidth="1.5"
            />
          </g>
        )}

      </svg>
      {hoverIdx != null && (
        <div
          className={cn(
            "pointer-events-none absolute z-10 min-w-[9rem] -translate-y-full rounded-lg border border-zinc-700 bg-[#1a1a1c] px-2.5 py-2 text-[11px] shadow-xl",
            // Near either edge, anchor from that side instead of centering
            // so the tooltip can't spill past the card's own edges.
            hoverIdx / lastIdx < 0.15
              ? "translate-x-0"
              : hoverIdx / lastIdx > 0.85
                ? "-translate-x-full"
                : "-translate-x-1/2"
          )}
          style={{
            left: `${(xAt(hoverIdx) / w) * 100}%`,
            top: `${(Math.min(yAt(active[hoverIdx] ?? 0), yAt(stay[hoverIdx] ?? 0)) / h) * 100}%`,
            marginTop: "-8px",
          }}
        >
          <p className="font-semibold text-zinc-200">Year {hoverIdx}</p>
          <p className="mt-1 flex items-center justify-between gap-2 text-gain">
            <span>Active</span>
            <span className="tabular-nums">
              {money(active[hoverIdx] ?? 0, currency, eurUsd)}
            </span>
          </p>
          <p className="flex items-center justify-between gap-2 text-zinc-400">
            <span>Stay</span>
            <span className="tabular-nums">
              {money(stay[hoverIdx] ?? 0, currency, eurUsd)}
            </span>
          </p>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 border-t-2 border-dashed border-zinc-500" />
          Stay the course · {money(stay[stay.length - 1] ?? 0, currency, eurUsd)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-gain">
          <span className="h-0.5 w-4 bg-gain" />
          Active path · {money(active[active.length - 1] ?? 0, currency, eurUsd)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-emerald-400/80">
          <span className="h-2 w-4 rounded-sm bg-gain/20" />
          Gap · {money(
            (active[active.length - 1] ?? 0) - (stay[stay.length - 1] ?? 0),
            currency,
            eurUsd
          )}
        </span>
      </div>
    </div>
  );
}

export function CompoundInterestSheet({
  bookValue,
  sheets,
  tickerValues = [],
  bookCash = 0,
  eurUsd = null,
  eurUsdDetail = null,
}: Props) {
  const [draft, setDraft] = useState<CompoundInputs>(DEFAULT_COMPOUND_INPUTS);
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [principalSource, setPrincipalSource] = useState<string>("custom");
  const [hydrated, setHydrated] = useState(false);
  const [shock, setShock] = useState<ShockKind>("none");
  const [milestoneActuals, setMilestoneActuals] = useState<MilestoneActuals>(
    {}
  );
  const [storyIdx, setStoryIdx] = useState(0);
  const [tipFlash, setTipFlash] = useState(false);
  const [copied, setCopied] = useState(false);
  // Only true once we've applied a fresh, never-before-stored default rate
  // — guards against clobbering a rate the user typed in, or re-rolling it
  // every time tickerValues re-renders with a new array identity.
  const appliedDefaultRateRef = useRef(false);

  useEffect(() => {
    const stored = loadStored();
    setDraft(stored);
    setCurrency(loadCompoundCurrency());
    setMilestoneActuals(loadMilestoneActuals());
    setHydrated(true);
  }, []);

  // First-ever visit (nothing in localStorage yet): swap the generic 8%
  // fallback for a rate derived from what this book actually holds, the
  // moment ticker data is ready. Runs once — after that, the stored value
  // (default or user-edited) is respected like any other persisted input.
  useEffect(() => {
    if (!hydrated || appliedDefaultRateRef.current) return;
    if (tickerValues.length === 0 && bookCash === 0) return;
    const stored = loadStored();
    const hadExplicitRate = Boolean(
      window.localStorage.getItem(COMPOUND_STORAGE_KEY)
    );
    appliedDefaultRateRef.current = true;
    if (hadExplicitRate) return;
    const blended = blendedExpectedAnnualReturn(tickerValues, {
      balance: bookCash,
      annualReturnPct: COMPOUND_CASH_YIELD_ANNUAL_PCT,
    });
    const pct = Math.round(blended * 1000) / 10;
    if (!(pct > 0)) return;
    setDraft({ ...stored, ratePercent: pct });
  }, [hydrated, tickerValues, bookCash]);

  useEffect(() => {
    if (!hydrated) return;
    saveCompoundCurrency(currency);
  }, [currency, hydrated]);

  const fxReady = currency === "USD" || (eurUsd != null && eurUsd > 0);
  const fxHint = formatEurUsdHint(eurUsd, eurUsdDetail);

  function show(amountUsd: number, digits = 0) {
    return money(amountUsd, currency, eurUsd, digits);
  }

  function setCurrencySafe(next: CurrencyCode) {
    setCurrency(next);
  }

  /** Money inputs are shown in display currency; draft stays USD. */
  function onMoneyUsdChange(
    displayAmount: number,
    apply: (usd: number) => void
  ) {
    apply(Math.round(displayToUsd(displayAmount, currency, eurUsd) * 100) / 100);
  }

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(COMPOUND_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
  }, [draft, hydrated]);

  // Sliders bind straight to `draft` so the handle/number label track the
  // pointer with zero lag. The month-by-month simulation behind it (up to
  // 480 iterations, x2-3 for shock/stay-course variants) is real work —
  // deferring it lets React keep the drag itself perfectly smooth and
  // catch the chart/table up right after, instead of recomputing on every
  // single pointermove tick.
  const deferredDraft = useDeferredValue(draft);
  const liveInputs: CompoundInputs = useMemo(
    () => ({ ...deferredDraft, compound: "monthly" }),
    [deferredDraft]
  );

  const result = useMemo(
    () => calculateWithShock(liveInputs, shock),
    [liveInputs, shock]
  );

  const stayResult = useMemo(
    () => calculateCompound(stayTheCourseInputs(liveInputs)),
    [liveInputs]
  );

  const tipping = useMemo(
    () => findTippingYear(result.yearly),
    [result.yearly]
  );

  useEffect(() => {
    if (tipping == null) return;
    setTipFlash(true);
    const id = window.setTimeout(() => setTipFlash(false), 1800);
    return () => window.clearTimeout(id);
  }, [tipping, draft.depositAmount]);

  const compare = useMemo(
    () => buildCompareScenarios(liveInputs, 6),
    [liveInputs]
  );
  const compareTakeaway = useMemo(() => buildCompareTakeaway(compare), [compare]);

  const narrative = useMemo(() => buildNarrative(result), [result]);

  const storyOpts = useMemo(
    () => storyYears(Math.max(liveInputs.years, 1)),
    [liveInputs.years]
  );

  const storyYear = storyOpts[Math.min(storyIdx, storyOpts.length - 1)] ?? 1;
  const storyRow =
    result.yearly.find((y) => y.index === storyYear) ??
    result.yearly[result.yearly.length - 1];

  const yearStories = useMemo(
    () => buildYearStories(result, storyOpts, tipping),
    [result, storyOpts, tipping]
  );

  const annualRatePct =
    liveInputs.ratePeriod === "annual"
      ? liveInputs.ratePercent
      : liveInputs.ratePercent * 12;

  const milestones = useMemo(
    () =>
      buildCompoundMilestones({
        inputs: liveInputs,
        annualRatePct,
        actuals: milestoneActuals,
      }),
    [liveInputs, annualRatePct, milestoneActuals]
  );
  const milestoneTakeaway = useMemo(
    () => buildMilestoneTakeaway(milestones),
    [milestones]
  );

  function setMilestoneActual(goal: number, iso: string) {
    setMilestoneActuals((prev) => {
      const next = { ...prev };
      if (!iso) delete next[String(goal)];
      else next[String(goal)] = iso;
      saveMilestoneActuals(next);
      return next;
    });
  }

  function patchDraft<K extends keyof CompoundInputs>(
    key: K,
    value: CompoundInputs[K]
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function applyPrincipal(source: string) {
    setPrincipalSource(source);
    if (source === "book") {
      patchDraft("principal", Math.round(bookValue * 100) / 100);
      return;
    }
    if (source === "custom") return;
    const sheet = sheets.find((s) => s.id === source);
    if (sheet) patchDraft("principal", Math.round(sheet.value * 100) / 100);
  }

  async function copyPostcard() {
    const text = [
      `Upside compound postcard`,
      `${show(result.principal)} → ${show(result.futureValue)} in ${liveInputs.years}y`,
      `Interest ${show(result.totalInterest)} · RoR ${(result.allTimeRoR * 100).toFixed(0)}%`,
      liveInputs.depositAmount > 0
        ? `+${show(liveInputs.depositAmount)}/mo deposits @ ${liveInputs.annualIncrease}% YoY`
        : `No deposits · pure compound`,
      shock !== "none" ? `Shock: ${shock}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  const durationLabel =
    liveInputs.months > 0
      ? `${liveInputs.years}y ${liveInputs.months}m`
      : `${liveInputs.years} year${liveInputs.years === 1 ? "" : "s"}`;

  const staySeries = stayResult.yearly.map((y) => y.balance);
  const activeSeries = result.yearly.map((y) => y.balance);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(280px,340px)_1fr]">
      {/* —— Inputs —— */}
      <aside className="space-y-5 rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-5">
        <div>
          <h2 className="text-sm font-semibold text-white">Compound playground</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Live projections — dial deposits, pick a sheet, shock the path.
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Currency
          </p>
          <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
            {CURRENCIES.map((c) => (
              <SegButton
                key={c.code}
                active={currency === c.code}
                onClick={() => setCurrencySafe(c.code)}
              >
                {c.label}
              </SegButton>
            ))}
          </div>
          <p
            className={cn(
              "mt-1.5 text-[11px] tabular-nums",
              fxReady ? "text-zinc-500" : "text-amber-300/90"
            )}
            title="Book amounts stay USD; EUR uses Yahoo EURUSD last → close → open"
          >
            {currency === "EUR"
              ? fxHint
              : eurUsd && eurUsd > 0
                ? `Book USD · ${fxHint}`
                : "Book USD"}
          </p>
        </div>

        <div>
          <label className="block text-xs text-zinc-400">
            Principal source
            <select
              value={principalSource}
              onChange={(e) => applyPrincipal(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
            >
              <option value="custom">Custom amount</option>
              <option value="book">
                All portfolios ({show(bookValue)})
              </option>
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({show(s.value)})
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-xs text-zinc-400">
            Initial investment
            <FormattedNumberInput
              kind="money"
              currency={currency}
              value={usdToDisplay(draft.principal, currency, eurUsd)}
              onChange={(n) => {
                setPrincipalSource("custom");
                onMoneyUsdChange(n, (usd) => patchDraft("principal", usd));
              }}
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
            />
          </label>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="block text-xs text-zinc-400">
            Interest rate %
            <FormattedNumberInput
              kind="percent"
              value={draft.ratePercent}
              onChange={(n) => patchDraft("ratePercent", n)}
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Period
            <select
              value={draft.ratePeriod}
              onChange={(e) =>
                patchDraft("ratePeriod", e.target.value as RatePeriod)
              }
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white outline-none focus:border-brand"
            >
              <option value="annual">annual</option>
              <option value="monthly">monthly</option>
            </select>
          </label>
        </div>

        <div>
          <p className="mb-1.5 text-xs text-zinc-400">Duration (years)</p>
          <input
            type="range"
            min={1}
            max={40}
            value={draft.years}
            onChange={(e) => patchDraft("years", Number(e.target.value))}
            className="w-full accent-[var(--brand)]"
          />
          <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
            <span>1y</span>
            <span className="tabular-nums text-zinc-300">{draft.years} years</span>
            <span>40y</span>
          </div>
        </div>

        {/* 4 — Contributions: one card for mode + amount + frequency, so
         * the deposit dial isn't a second, disconnected control for the
         * same thing this section already governs. */}
        <div
          className={cn(
            "rounded-xl border p-3 transition",
            tipFlash
              ? "border-gain/50 bg-gain/10"
              : "border-zinc-800 bg-zinc-900/40"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-300">Contributions</p>
            {tipping != null &&
              (draft.contributionMode === "deposits" ||
                draft.contributionMode === "both") && (
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gain">
                  Tip year {tipping}
                </span>
              )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
            {(
              [
                ["none", "None"],
                ["deposits", "Deposits"],
                ["withdrawals", "Withdrawals"],
                ["both", "Both"],
              ] as const
            ).map(([id, label]) => (
              <SegButton
                key={id}
                active={draft.contributionMode === id}
                onClick={() =>
                  patchDraft("contributionMode", id as ContributionMode)
                }
              >
                {label}
              </SegButton>
            ))}
          </div>

          {(draft.contributionMode === "deposits" ||
            draft.contributionMode === "both") && (
            <div className="mt-3 space-y-2.5 border-t border-zinc-800/60 pt-3">
              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span>Monthly deposit</span>
                <span className="tabular-nums text-brand-bright">
                  {show(draft.depositAmount)}/mo
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={2000}
                step={50}
                value={Math.min(2000, draft.depositAmount)}
                onChange={(e) =>
                  patchDraft("depositAmount", Number(e.target.value))
                }
                className="w-full accent-[var(--brand)]"
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[11px] text-zinc-500">
                  Frequency
                  <select
                    value={draft.depositFrequency}
                    onChange={(e) =>
                      patchDraft(
                        "depositFrequency",
                        e.target.value as ContributionFrequency
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white outline-none focus:border-brand"
                  >
                    <option value="monthly">monthly</option>
                    <option value="annually">annually</option>
                  </select>
                </label>
                <label className="block text-[11px] text-zinc-500">
                  Annual increase %
                  <FormattedNumberInput
                    kind="percent"
                    value={draft.annualIncrease}
                    onChange={(n) => patchDraft("annualIncrease", n)}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white outline-none focus:border-brand"
                  />
                </label>
              </div>
            </div>
          )}

          {(draft.contributionMode === "withdrawals" ||
            draft.contributionMode === "both") && (
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-zinc-800/60 pt-3">
              <label className="block text-[11px] text-zinc-500">
                Withdrawal / mo
                <FormattedNumberInput
                  kind="money"
                  currency={currency}
                  value={usdToDisplay(draft.withdrawalAmount, currency, eurUsd)}
                  onChange={(n) =>
                    onMoneyUsdChange(n, (usd) =>
                      patchDraft("withdrawalAmount", usd)
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white outline-none focus:border-brand"
                />
              </label>
              <label className="block text-[11px] text-zinc-500">
                Frequency
                <select
                  value={draft.withdrawalFrequency}
                  onChange={(e) =>
                    patchDraft(
                      "withdrawalFrequency",
                      e.target.value as ContributionFrequency
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white outline-none focus:border-brand"
                >
                  <option value="monthly">monthly</option>
                  <option value="annually">annually</option>
                </select>
              </label>
            </div>
          )}
        </div>

        {/* 7 — Shock buttons */}
        <div>
          <p className="mb-1.5 text-xs text-zinc-400">Shock the path</p>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["none", "Smooth"],
                ["drawdown30", "−30% Y1"],
                ["flat2y", "Flat 2y"],
              ] as const
            ).map(([id, label]) => (
              <SegButton
                key={id}
                active={shock === id}
                onClick={() => setShock(id)}
              >
                {label}
              </SegButton>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-600">
            Path dependence without a lecture — then compounding resumes.
          </p>
        </div>

        <p className="text-[11px] text-zinc-600">
          Compounded monthly · live updates as you dial
        </p>
      </aside>

      {/* —— Results playground —— */}
      <section className="space-y-5">
        {/* Hero stats */}
        <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h3 className="text-base font-semibold text-white sm:text-lg">
              Interest calculation for {durationLabel}
            </h3>
            <button
              type="button"
              onClick={() => void copyPostcard()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white"
            >
              {copied ? (
                <Copy className="h-3.5 w-3.5 text-gain" />
              ) : (
                <Share2 className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Postcard"}
            </button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Future value
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-gain sm:text-3xl">
                {show(result.futureValue)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Total interest
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-orange-400 sm:text-3xl">
                {show(result.totalInterest)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Initial balance
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-sky-400 sm:text-3xl">
                {show(result.principal)}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 border-t border-zinc-800 pt-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-zinc-500">Yearly → compounded</p>
              <p className="mt-0.5 tabular-nums text-zinc-200">
                {(result.nominalAnnualRate * 100).toFixed(2)}% →{" "}
                {(result.effectiveAnnualRate * 100).toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">All-time RoR</p>
              <p className="mt-0.5 inline-flex items-center gap-1 tabular-nums text-gain">
                {(result.allTimeRoR * 100).toFixed(1)}%
                <ArrowUpRight className="h-3.5 w-3.5" />
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Time to double</p>
              <p className="mt-0.5 tabular-nums text-zinc-200">
                {Number.isFinite(result.doubleYears)
                  ? `${result.doubleYears}y ${result.doubleMonths}m`
                  : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* 1 — Dual path */}
        <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-5">
          <h4 className="text-sm font-semibold text-white">
            Your book vs the path
          </h4>
          <p className="mt-1 text-xs text-zinc-500">
            Dashed = stay invested, no new deposits. Solid = your dialed path
            {shock !== "none" ? " (with shock)" : ""}.
          </p>
          <div className="mt-4">
            <DualPathChart
              stay={staySeries}
              active={activeSeries}
              currency={currency}
              eurUsd={eurUsd}
              tippingYear={tipping}
            />
          </div>
        </div>

        {/* 2 — Milestone tracker (driven by compounder dial) */}
        <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Target className="h-4 w-4 text-brand" />
            <h4 className="text-sm font-semibold text-white">
              Milestone tracker
            </h4>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Target dates and years-until recompute from your dialed principal,
            rate, deposits, and compounding — same path as Calculate.
          </p>
          {milestoneTakeaway && (
            <p className="mt-3 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-sm text-brand-bright">
              {milestoneTakeaway}
            </p>
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="pb-2 pr-3 font-medium">Goal</th>
                  <th
                    className="pb-2 pr-3 font-medium"
                    title="Projected date you'd cross this goal at your dialed rate"
                  >
                    Target
                  </th>
                  <th
                    className="pb-2 pr-3 font-medium"
                    title="The date you actually crossed it, once you've logged it as hit"
                  >
                    Actual
                  </th>
                  <th className="pb-2 pr-3 font-medium">Years until</th>
                  <th
                    className="pb-2 pr-3 font-medium"
                    title="Compound Annual Growth Rate — the steady yearly rate that would take you from one milestone to the next, once both have real dates"
                  >
                    CAGR
                  </th>
                  <th
                    className="pb-2 font-medium"
                    title="The annual rate dialed into this calculator — what's driving the Target date"
                  >
                    Est. growth
                  </th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((row) => {
                  const done = row.hit || Boolean(row.actualDate);
                  return (
                    <tr
                      key={row.goal}
                      className={cn(
                        "border-b border-zinc-800/80",
                        done && "bg-emerald-500/[0.06]"
                      )}
                    >
                      <td className="py-2.5 pr-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-2 tabular-nums",
                            done ? "font-semibold text-gain" : "text-zinc-200"
                          )}
                        >
                          {done ? (
                            <CheckCircle2
                              className="h-4 w-4 shrink-0 text-gain"
                              aria-hidden
                            />
                          ) : (
                            <span
                              className="inline-block h-3.5 w-3.5 shrink-0 rounded border border-zinc-600 bg-transparent"
                              aria-hidden
                            />
                          )}
                          {show(row.goal)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-zinc-300">
                        {row.hit ? (
                          <span className="font-medium text-gain">Hit ✓</span>
                        ) : row.targetDate ? (
                          formatMilestoneDate(row.targetDate)
                        ) : (
                          "Beyond 50y"
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <input
                          type="date"
                          value={row.actualDate ?? ""}
                          onChange={(e) =>
                            setMilestoneActual(row.goal, e.target.value)
                          }
                          className={cn(
                            "max-w-[9.5rem] rounded border bg-zinc-900 px-1.5 py-1 text-xs tabular-nums outline-none focus:border-brand",
                            done
                              ? "border-gain/40 text-gain"
                              : "border-zinc-700 text-zinc-300"
                          )}
                        />
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-zinc-300">
                        {row.hit
                          ? "—"
                          : row.yearsUntil != null
                            ? row.yearsUntil.toFixed(1)
                            : "—"}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-zinc-300">
                        {row.cagrPct != null ? `${row.cagrPct}%` : "—"}
                      </td>
                      <td className="py-2.5 tabular-nums text-zinc-300">
                        {row.hit ? "—" : `${row.estGrowthPct}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3 — Year-flip story cards */}
        <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-5">
          <h4 className="text-sm font-semibold text-white">Year-flip stories</h4>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {storyOpts.map((y, i) => (
              <SegButton
                key={y}
                active={storyIdx === i}
                onClick={() => setStoryIdx(i)}
              >
                Year {y}
                {tipping === y && (
                  <span
                    className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-gain align-middle"
                    title="The flip — interest first beats deposits this year"
                    aria-hidden
                  />
                )}
              </SegButton>
            ))}
          </div>
          {storyRow && (
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Year {storyRow.index}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                {show(storyRow.balance)}
              </p>
              <p className="mt-2 text-sm text-zinc-400">
                {yearStories.get(storyRow.index) ??
                  `Interest earned this year: ${show(storyRow.interest)}. Accrued interest: ${show(storyRow.accruedInterest)}.`}
              </p>
            </div>
          )}
        </div>

        {/* 5 — Lazy vs Upside */}
        <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand" />
            <h4 className="text-sm font-semibold text-white">
              Lazy vs Upside
            </h4>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Same principal & horizon — not advice, just contrast.
          </p>
          {compareTakeaway && (
            <p className="mt-3 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-sm text-brand-bright">
              {compareTakeaway}
            </p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {compare.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3"
                style={{ borderTopColor: s.color, borderTopWidth: 2 }}
              >
                <p className="text-sm font-semibold text-white">{s.label}</p>
                <p className="text-[11px] text-zinc-500">{s.tagline}</p>
                <p
                  className="mt-3 text-xl font-bold tabular-nums"
                  style={{ color: s.color }}
                >
                  {show(s.result.futureValue)}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Interest {show(s.result.totalInterest)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 8 — Margus narrative */}
        <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            <h4 className="text-sm font-semibold text-white">
              The quick read
            </h4>
          </div>
          <ul className="mt-3 space-y-2">
            {narrative.map((line) => (
              <li
                key={line}
                className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2 text-sm leading-relaxed text-zinc-300"
              >
                {line}
              </li>
            ))}
          </ul>
        </div>

        {/* Yearly table */}
        <div className="overflow-hidden rounded-xl border border-brand-deep/30 bg-[#161618]/80">
          <div className="border-b border-zinc-800 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Yearly breakdown
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-2.5 font-medium">Year</th>
                  <th className="px-4 py-2.5 font-medium">Interest</th>
                  <th className="bg-orange-500/10 px-4 py-2.5 font-medium text-orange-300">
                    Accrued interest
                  </th>
                  <th className="bg-emerald-500/10 px-4 py-2.5 font-medium text-emerald-300">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.yearly.map((row, i) => {
                  const isLast = i === result.yearly.length - 1;
                  return (
                    <tr
                      key={row.index}
                      className="border-b border-zinc-800/80 hover:bg-zinc-900/40"
                    >
                      <td className="px-4 py-2 tabular-nums text-zinc-300">
                        {row.index}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-zinc-300">
                        {row.index === 0
                          ? "—"
                          : show(row.interest, 2)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2 tabular-nums",
                          isLast
                            ? "bg-orange-500/20 font-semibold text-orange-300"
                            : "text-zinc-300"
                        )}
                      >
                        {row.index === 0
                          ? "—"
                          : show(row.accruedInterest, 2)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2 tabular-nums",
                          isLast
                            ? "bg-emerald-500/20 font-semibold text-gain"
                            : "text-zinc-100"
                        )}
                      >
                        {show(row.balance, 2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 6 — Postcard preview */}
        <div className="rounded-xl border border-brand/30 bg-gradient-to-br from-brand/10 via-[#161618] to-[#161618] p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-brand" />
              <h4 className="text-sm font-semibold text-white">
                Compound postcard
              </h4>
            </div>
            <button
              type="button"
              onClick={() => void copyPostcard()}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-[#121214] hover:bg-brand-bright"
            >
              {copied ? "Copied ✓" : "Copy share text"}
            </button>
          </div>
          <p className="mt-4 text-lg font-semibold tracking-tight text-white sm:text-xl">
            {show(result.principal)} →{" "}
            {show(result.futureValue)}{" "}
            <span className="text-zinc-500">in {durationLabel}</span>
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Interest {show(result.totalInterest)} ·{" "}
            {(result.allTimeRoR * 100).toFixed(0)}% all-time RoR
            {draft.depositAmount > 0
              ? ` · +${show(draft.depositAmount)}/mo`
              : ""}
          </p>
        </div>
      </section>
    </div>
  );
}
