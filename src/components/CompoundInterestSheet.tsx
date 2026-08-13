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
  /** Per-ticker book-wide value in USD to derive default interest rate from holdings */
  tickerValues?: Array<{ ticker: string; value: number }>;
  /** Book-wide cash in USD for the blended rate calculation */
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
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1.5 text-xs font-medium transition touch-target",
        active
          ? "bg-brand/20 text-brand-bright ring-1 ring-inset ring-brand/40 shadow-sm"
          : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200",
        className
      )}
    >
      {children}
    </button>
  );
}

function ChipButton({
  active,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-1 text-xs font-medium transition tabular-nums",
        active
          ? "bg-brand/25 text-brand-bright ring-1 ring-brand/50 font-semibold"
          : "border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200",
        className
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
          className="pointer-events-none absolute top-2 rounded-md border border-zinc-700 bg-zinc-900/95 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur"
          style={{
            left: `${Math.min(
              82,
              Math.max(18, ((xAt(hoverIdx) - padL) / plotW) * 100)
            )}%`,
            transform: "translateX(-50%)",
          }}
        >
          <p className="font-semibold text-white">Year {hoverIdx}</p>
          <p className="tabular-nums text-gain">
            Plan: {money(active[hoverIdx] ?? 0, currency, eurUsd, 0)}
          </p>
          <p className="tabular-nums text-zinc-400">
            No deposits: {money(stay[hoverIdx] ?? 0, currency, eurUsd, 0)}
          </p>
          {tippingYear === hoverIdx && (
            <p className="mt-0.5 text-xs font-semibold text-gain">
              Tipping year
            </p>
          )}
        </div>
      )}
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
  const appliedDefaultRateRef = useRef(false);

  // Calculate the portfolio's actual blended expected growth rate
  const portfolioExpectedRatePct = useMemo(() => {
    if (tickerValues.length === 0 && bookCash === 0) return 10.0;
    const blended = blendedExpectedAnnualReturn(tickerValues, {
      balance: bookCash,
      annualReturnPct: COMPOUND_CASH_YIELD_ANNUAL_PCT,
    });
    const pct = Math.round(blended * 1000) / 10;
    return pct > 0 ? pct : 10.0;
  }, [tickerValues, bookCash]);

  useEffect(() => {
    const stored = loadStored();
    setDraft(stored);
    setCurrency(loadCompoundCurrency());
    setMilestoneActuals(loadMilestoneActuals());
    setHydrated(true);
  }, []);

  // Sync default interest rate to the portfolio's average growth rate by default
  useEffect(() => {
    if (!hydrated || appliedDefaultRateRef.current) return;
    if (portfolioExpectedRatePct > 0) {
      appliedDefaultRateRef.current = true;
      const stored = loadStored();
      const rawStored = typeof window !== "undefined" ? window.localStorage.getItem(COMPOUND_STORAGE_KEY) : null;
      // If never saved before or matches the generic 8% fallback, adopt portfolio's real rate
      if (!rawStored || stored.ratePercent === 8 || stored.ratePercent === DEFAULT_COMPOUND_INPUTS.ratePercent) {
        setDraft((prev) => ({
          ...prev,
          ratePercent: portfolioExpectedRatePct,
          principal: bookValue > 0 && prev.principal === 5000 ? Math.round(bookValue) : prev.principal,
        }));
        if (bookValue > 0 && stored.principal === 5000) {
          setPrincipalSource("book");
        }
      }
    }
  }, [hydrated, portfolioExpectedRatePct, bookValue]);

  useEffect(() => {
    if (!hydrated) return;
    saveCompoundCurrency(currency);
  }, [currency, hydrated]);

  const fxHint = formatEurUsdHint(eurUsd, eurUsdDetail);

  function show(amountUsd: number, digits = 0) {
    return money(amountUsd, currency, eurUsd, digits);
  }

  function setCurrencySafe(next: CurrencyCode) {
    setCurrency(next);
  }

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

  const firstPendingRowRef = useRef<HTMLTableRowElement | null>(null);
  const milestoneScrollRef = useRef<HTMLDivElement | null>(null);
  const scrolledToMilestoneRef = useRef(false);
  useEffect(() => {
    if (scrolledToMilestoneRef.current) return;
    const row = firstPendingRowRef.current;
    const box = milestoneScrollRef.current;
    if (!row || !box) return;
    scrolledToMilestoneRef.current = true;
    const rowRect = row.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const delta = rowRect.top - boxRect.top;
    box.scrollTop = Math.max(
      0,
      box.scrollTop + delta - box.clientHeight / 2 + rowRect.height / 2
    );
  }, [milestones]);

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

  function syncToPortfolioRate() {
    patchDraft("ratePercent", portfolioExpectedRatePct);
    patchDraft("ratePeriod", "annual");
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

  // Dynamic max slider ranges based on current values
  const principalSliderMax = Math.max(100000, Math.ceil((draft.principal * 1.5) / 10000) * 10000);
  const depositSliderMax = Math.max(5000, Math.ceil((draft.depositAmount * 2) / 500) * 500);

  const isRateMatchedToPortfolio = Math.abs(draft.ratePercent - portfolioExpectedRatePct) < 0.05;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(320px,380px)_1fr]">
      {/* Interactive Controls Sidebar */}
      <aside className="space-y-4 rounded-xl border border-brand-deep/30 bg-[#161618]/90 p-4 sm:p-5">
        <div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/20 text-brand-bright ring-1 ring-brand/40">
                <Calculator className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-sm font-semibold text-white">Growth calculator</h2>
            </div>
            <span className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-xs font-medium text-zinc-300">
              Interactive
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            What this book could become if you keep adding. Type a number or
            drag a slider. Not a forecast.
          </p>
        </div>

        {/* Currency Selector */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Show amounts in
            </span>
            <div className="flex gap-1">
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
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            {currency === "EUR"
              ? fxHint
              : eurUsd && eurUsd > 0
                ? `Book in USD · ${fxHint}`
                : "Book in USD"}
          </p>
        </div>

        {/* 1. Initial Investment (Principal) */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <label htmlFor="compound-principal-input" className="text-xs font-semibold text-zinc-200">
              1. Initial Investment
            </label>
            <span className="text-xs font-medium text-brand-bright tabular-nums">
              {show(draft.principal, 0)}
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Starting capital you are putting to work today.
          </p>

          {/* Quick Source Dropdown */}
          <select
            value={principalSource}
            onChange={(e) => applyPrincipal(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-white outline-none focus:border-brand"
          >
            <option value="custom">Custom amount</option>
            {bookValue > 0 && (
              <option value="book">
                Full Book Value ({show(bookValue, 0)})
              </option>
            )}
            {sheets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({show(s.value, 0)})
              </option>
            ))}
          </select>

          {/* Direct Formatted Punch-in Input */}
          <div className="relative">
            <FormattedNumberInput
              id="compound-principal-input"
              kind="money"
              currency={currency}
              value={usdToDisplay(draft.principal, currency, eurUsd)}
              onChange={(n) => {
                setPrincipalSource("custom");
                onMoneyUsdChange(n, (usd) => patchDraft("principal", usd));
              }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-brand focus:ring-1 focus:ring-brand/40"
            />
          </div>

          {/* Quick Amount Chips */}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {[1000, 5000, 10000, 25000, 50000, 100000].map((amt) => {
              const displayAmt = Math.round(displayToUsd(amt, currency, eurUsd));
              return (
                <ChipButton
                  key={amt}
                  active={Math.abs(draft.principal - displayAmt) < 50}
                  onClick={() => {
                    setPrincipalSource("custom");
                    patchDraft("principal", displayAmt);
                  }}
                >
                  {currency === "USD" ? `$${amt >= 1000 ? `${amt / 1000}k` : amt}` : `€${amt >= 1000 ? `${amt / 1000}k` : amt}`}
                </ChipButton>
              );
            })}
          </div>

          {/* Synchronized Slider */}
          <div className="pt-1">
            <input
              type="range"
              min={0}
              max={principalSliderMax}
              step={1000}
              value={draft.principal}
              onChange={(e) => {
                setPrincipalSource("custom");
                patchDraft("principal", Number(e.target.value));
              }}
              className="w-full accent-[var(--brand)] cursor-pointer"
            />
            <div className="flex justify-between text-xs text-zinc-400">
              <span>{show(0)}</span>
              <span>{show(principalSliderMax)}</span>
            </div>
          </div>
        </div>

        {/* 2. Expected Annual Growth Rate */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <label htmlFor="compound-rate-input" className="text-xs font-semibold text-zinc-200">
              2. Expected Growth Rate
            </label>
            <span className="text-xs font-bold text-gain tabular-nums">
              {draft.ratePercent.toFixed(1)}% / yr
            </span>
          </div>

          {/* Portfolio Sync Badge / Button */}
          <div className="flex items-center justify-between rounded-lg border border-brand/30 bg-brand/10 px-2.5 py-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-brand-bright" />
              <span className="text-xs text-zinc-300">
                Portfolio avg growth:{" "}
                <strong className="text-brand-bright tabular-nums">
                  {portfolioExpectedRatePct.toFixed(1)}%/yr
                </strong>
              </span>
            </div>
            {!isRateMatchedToPortfolio && (
              <button
                type="button"
                onClick={syncToPortfolioRate}
                className="rounded bg-brand/20 px-2 py-0.5 text-xs font-semibold text-brand-bright hover:bg-brand/30 transition"
              >
                Sync
              </button>
            )}
            {isRateMatchedToPortfolio && (
              <span className="text-xs font-medium text-gain flex items-center gap-0.5">
                <CheckCircle2 className="h-3 w-3" /> Matched
              </span>
            )}
          </div>

          {/* Direct Punch-in and Period */}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="relative">
              <FormattedNumberInput
                id="compound-rate-input"
                kind="percent"
                value={draft.ratePercent}
                onChange={(n) => patchDraft("ratePercent", Math.max(0, n))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-brand focus:ring-1 focus:ring-brand/40"
              />
            </div>
            <select
              value={draft.ratePeriod}
              onChange={(e) =>
                patchDraft("ratePeriod", e.target.value as RatePeriod)
              }
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs text-white outline-none focus:border-brand"
            >
              <option value="annual">annual</option>
              <option value="monthly">monthly</option>
            </select>
          </div>

          {/* Benchmark Preset Chips */}
          <div>
            <span className="text-xs uppercase tracking-wide text-zinc-400">
              Benchmarks
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              <ChipButton
                active={isRateMatchedToPortfolio}
                onClick={syncToPortfolioRate}
              >
                Book ({portfolioExpectedRatePct.toFixed(1)}%)
              </ChipButton>
              <ChipButton
                active={draft.ratePercent === 10}
                onClick={() => {
                  patchDraft("ratePercent", 10);
                  patchDraft("ratePeriod", "annual");
                }}
              >
                S&P 500 (10%)
              </ChipButton>
              <ChipButton
                active={draft.ratePercent === 15}
                onClick={() => {
                  patchDraft("ratePercent", 15);
                  patchDraft("ratePeriod", "annual");
                }}
              >
                Growth (15%)
              </ChipButton>
              <ChipButton
                active={draft.ratePercent === 25}
                onClick={() => {
                  patchDraft("ratePercent", 25);
                  patchDraft("ratePeriod", "annual");
                }}
              >
                High Conviction (25%)
              </ChipButton>
            </div>
          </div>

          {/* Steppers & Slider */}
          <div className="pt-1">
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <span className="text-xs text-zinc-400">Quick step</span>
              <div className="flex gap-1">
                {[-1, -0.5, 0.5, 1].map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() =>
                      patchDraft(
                        "ratePercent",
                        Math.max(0, Math.round((draft.ratePercent + step) * 10) / 10)
                      )
                    }
                    className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
                  >
                    {step > 0 ? `+${step}%` : `${step}%`}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              step={0.5}
              value={Math.min(50, draft.ratePercent)}
              onChange={(e) => patchDraft("ratePercent", Number(e.target.value))}
              className="w-full accent-[var(--brand)] cursor-pointer"
            />
            <div className="flex justify-between text-xs text-zinc-400">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
            </div>
          </div>
        </div>

        {/* 3. Duration (Time Horizon) */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <label htmlFor="compound-duration-input" className="text-xs font-semibold text-zinc-200">
              3. Time Horizon
            </label>
            <span className="text-xs font-bold text-sky-400 tabular-nums">
              {durationLabel}
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Number of years you stay invested and let compounding work.
          </p>

          {/* Direct Punch-in Box */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                id="compound-duration-input"
                type="number"
                min={1}
                max={50}
                value={draft.years || ""}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  patchDraft("years", Number.isNaN(val) ? 1 : Math.min(50, Math.max(1, val)));
                }}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-brand focus:ring-1 focus:ring-brand/40"
              />
              <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-zinc-400">
                years
              </span>
            </div>
          </div>

          {/* Quick Year Chips */}
          <div className="flex flex-wrap gap-1">
            {[3, 5, 10, 15, 20, 25, 30].map((yr) => (
              <ChipButton
                key={yr}
                active={draft.years === yr}
                onClick={() => patchDraft("years", yr)}
              >
                {yr}y
              </ChipButton>
            ))}
          </div>

          {/* Synchronized Slider */}
          <div className="pt-1">
            <input
              type="range"
              min={1}
              max={40}
              value={draft.years}
              onChange={(e) => patchDraft("years", Number(e.target.value))}
              className="w-full accent-[var(--brand)] cursor-pointer"
            />
            <div className="flex justify-between text-xs text-zinc-400">
              <span>1 year</span>
              <span>20 years</span>
              <span>40 years</span>
            </div>
          </div>
        </div>

        {/* 4. Regular Savings & Cashflows */}
        <div
          className={cn(
            "rounded-xl border p-3.5 space-y-3 transition",
            tipFlash
              ? "border-gain/50 bg-gain/10 ring-1 ring-gain/30"
              : "border-zinc-800/80 bg-zinc-900/30"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-200">
              4. Regular Contributions
            </span>
            {tipping != null &&
              (draft.contributionMode === "deposits" ||
                draft.contributionMode === "both") && (
                <span className="text-xs font-semibold uppercase tracking-wide text-gain rounded bg-gain/15 px-1.5 py-0.5">
                  Tipping Year {tipping}
                </span>
              )}
          </div>
          <p className="text-xs text-zinc-400">
            Adding savings month-by-month accelerates your compounding curve.
          </p>

          {/* Mode Tabs */}
          <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
            {(
              [
                ["deposits", "Deposits"],
                ["none", "None"],
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

          {/* Deposit Fields */}
          {(draft.contributionMode === "deposits" ||
            draft.contributionMode === "both") && (
            <div className="space-y-2.5 border-t border-zinc-800/60 pt-2.5">
              <div className="flex items-center justify-between">
                <label htmlFor="compound-deposit-input" className="text-xs text-zinc-300 font-medium">
                  Deposit Amount
                </label>
                <span className="text-xs font-bold text-brand-bright tabular-nums">
                  {show(draft.depositAmount, 0)} / {draft.depositFrequency === "annually" ? "yr" : "mo"}
                </span>
              </div>

              {/* Direct Formatted Punch-in */}
              <FormattedNumberInput
                id="compound-deposit-input"
                kind="money"
                currency={currency}
                value={usdToDisplay(draft.depositAmount, currency, eurUsd)}
                onChange={(n) =>
                  onMoneyUsdChange(n, (usd) => patchDraft("depositAmount", usd))
                }
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-brand focus:ring-1 focus:ring-brand/40"
              />

              {/* Quick Deposit Chips */}
              <div className="flex flex-wrap gap-1">
                {[0, 100, 250, 500, 1000, 2500].map((amt) => {
                  const displayAmt = Math.round(displayToUsd(amt, currency, eurUsd));
                  return (
                    <ChipButton
                      key={amt}
                      active={Math.abs(draft.depositAmount - displayAmt) < 5}
                      onClick={() => patchDraft("depositAmount", displayAmt)}
                    >
                      {currency === "USD" ? `$${amt}` : `€${amt}`}/mo
                    </ChipButton>
                  );
                })}
              </div>

              {/* Synchronized Slider */}
              <div className="pt-1">
                <input
                  type="range"
                  min={0}
                  max={depositSliderMax}
                  step={50}
                  value={draft.depositAmount}
                  onChange={(e) =>
                    patchDraft("depositAmount", Number(e.target.value))
                  }
                  className="w-full accent-[var(--brand)] cursor-pointer"
                />
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>{show(0)}</span>
                  <span>{show(depositSliderMax)}</span>
                </div>
              </div>

              {/* Frequency and Annual Increase */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="block text-xs text-zinc-400">
                  Frequency
                  <select
                    value={draft.depositFrequency}
                    onChange={(e) =>
                      patchDraft(
                        "depositFrequency",
                        e.target.value as ContributionFrequency
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white outline-none focus:border-brand"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="annually">Annually</option>
                  </select>
                </label>
                <label className="block text-xs text-zinc-400">
                  Yearly Raise %
                  <FormattedNumberInput
                    kind="percent"
                    value={draft.annualIncrease}
                    onChange={(n) => patchDraft("annualIncrease", n)}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white outline-none focus:border-brand"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Withdrawal Fields */}
          {(draft.contributionMode === "withdrawals" ||
            draft.contributionMode === "both") && (
            <div className="space-y-2 border-t border-zinc-800/60 pt-2.5">
              <label className="block text-xs text-zinc-400">
                Withdrawal Amount
                <FormattedNumberInput
                  kind="money"
                  currency={currency}
                  value={usdToDisplay(draft.withdrawalAmount, currency, eurUsd)}
                  onChange={(n) =>
                    onMoneyUsdChange(n, (usd) =>
                      patchDraft("withdrawalAmount", usd)
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white outline-none focus:border-brand"
                />
              </label>
            </div>
          )}
        </div>

        {/* 5. Shock Scenarios */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-200">
              5. Stress Test Your Plan
            </span>
            <span className="text-xs text-zinc-400">Path dependence</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["none", "Smooth Compound"],
                ["drawdown30", "−30% Drop Y1"],
                ["flat2y", "Flat 2 Years"],
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
          <p className="text-xs leading-relaxed text-zinc-400">
            {shock === "none"
              ? "Theoretical continuous growth path."
              : shock === "drawdown30"
                ? "Models a 30% crash in year 1 followed by recovery."
                : "Models 2 years of flat market stagnation before growth resumes."}
          </p>
        </div>
      </aside>

      {/* Results & Projections Section */}
      <section className="space-y-5">
        {/* Hero KPI Summary */}
        <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-bright">
                Compound Horizon Forecast
              </span>
              <h3 className="text-base font-bold text-white sm:text-lg">
                Estimated Result for {durationLabel}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => void copyPostcard()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white transition"
            >
              {copied ? (
                <Copy className="h-3.5 w-3.5 text-gain" />
              ) : (
                <Share2 className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Share Summary"}
            </button>
          </div>

          {/* Primary Cards */}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Future Portfolio Value
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-gain sm:text-3xl">
                {show(result.futureValue)}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {liveInputs.depositAmount > 0
                  ? `Includes ${show(result.totalDeposited)} total deposits`
                  : "Pure compound with 0 deposits"}
              </p>
            </div>

            <div className="rounded-xl border border-orange-500/30 bg-orange-950/20 p-3.5">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Total Interest Earned
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-orange-400 sm:text-3xl">
                {show(result.totalInterest)}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {result.totalDeposited > 0
                  ? `${((result.totalInterest / result.futureValue) * 100).toFixed(0)}% of final portfolio`
                  : "Compound gains"}
              </p>
            </div>

            <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3.5">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Starting Investment
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-sky-400 sm:text-3xl">
                {show(result.principal)}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {principalSource === "book" ? "Current Book Value" : "Initial Capital"}
              </p>
            </div>
          </div>

          {/* Secondary Stats */}
          <div className="mt-4 grid gap-3 border-t border-zinc-800/80 pt-4 text-xs sm:grid-cols-4">
            <div>
              <p className="text-zinc-400">Effective Annual Yield</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-200">
                {(result.effectiveAnnualRate * 100).toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-zinc-400">All-time Return on Money</p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-sm font-semibold tabular-nums text-gain">
                {(result.allTimeRoR * 100).toFixed(1)}%
                <ArrowUpRight className="h-3.5 w-3.5" />
              </p>
            </div>
            <div>
              <p className="text-zinc-400">Time to Double</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-200">
                {Number.isFinite(result.doubleYears)
                  ? `${result.doubleYears}y ${result.doubleMonths}m`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-zinc-400">Tipping Point</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-brand-bright">
                {tipping != null ? `Year ${tipping}` : "No deposits"}
              </p>
            </div>
          </div>
        </div>

        {/* Dual Path Chart */}
        <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-white">
                Your Compound Curve
              </h4>
              <p className="mt-0.5 text-xs text-zinc-400">
                Solid green line = your dialed plan. Dashed line = staying invested with zero extra deposits.
              </p>
            </div>
            {tipping != null && (
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/40">
                Tipping Point: Year {tipping}
              </span>
            )}
          </div>
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

        {/* Milestone Tracker */}
        <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Target className="h-4 w-4 text-brand-bright" />
            <h4 className="text-sm font-semibold text-white">
              Wealth Milestone Ladder
            </h4>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Projected dates and timeframes to cross major net worth milestones at your dialed growth rate.
          </p>
          {milestoneTakeaway && (
            <p className="mt-3 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-brand-bright">
              {milestoneTakeaway}
            </p>
          )}
          <div
            ref={milestoneScrollRef}
            className="relative mt-4 max-h-[24rem] overflow-y-auto overflow-x-auto rounded-lg border border-zinc-800"
          >
            <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#161618]">
                <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-400">
                  <th className="py-2.5 px-3 font-medium">Goal</th>
                  <th className="py-2.5 px-3 font-medium">Estimated Date</th>
                  <th className="py-2.5 px-3 font-medium">Actual Achieved</th>
                  <th className="py-2.5 px-3 font-medium">Years Away</th>
                  <th className="py-2.5 px-3 font-medium">CAGR Pace</th>
                  <th className="py-2.5 px-3 font-medium">Growth Rate</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let firstPendingSeen = false;
                  return milestones.map((row) => {
                    const done = row.hit || Boolean(row.actualDate);
                    const isFirstPending = !done && !firstPendingSeen;
                    if (isFirstPending) firstPendingSeen = true;
                    return (
                      <tr
                        key={row.goal}
                        ref={isFirstPending ? firstPendingRowRef : undefined}
                        className={cn(
                          "border-b border-zinc-800/80 transition hover:bg-zinc-800/30",
                          done && "bg-emerald-500/[0.06]"
                        )}
                      >
                        <td className="py-2.5 px-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-2 tabular-nums font-medium",
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
                        <td className="py-2.5 px-3 tabular-nums text-zinc-300">
                          {row.hit ? (
                            <span className="font-semibold text-gain">Achieved</span>
                          ) : row.targetDate ? (
                            formatMilestoneDate(row.targetDate)
                          ) : (
                            "Beyond 50y"
                          )}
                        </td>
                        <td className="py-2.5 px-3">
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
                        <td className="py-2.5 px-3 tabular-nums text-zinc-300">
                          {row.hit
                            ? "—"
                            : row.yearsUntil != null
                              ? `${row.yearsUntil.toFixed(1)}y`
                              : "—"}
                        </td>
                        <td className="py-2.5 px-3 tabular-nums text-zinc-300">
                          {row.cagrPct != null ? `${row.cagrPct}%` : "—"}
                        </td>
                        <td className="py-2.5 px-3 tabular-nums text-zinc-300">
                          {row.hit ? "—" : `${row.estGrowthPct}%`}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Year-by-Year Story Cards */}
        <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-5">
          <h4 className="text-sm font-semibold text-white">Year-by-Year Milestones</h4>
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
                    title="Tipping year: interest outpaces deposits"
                    aria-hidden
                  />
                )}
              </SegButton>
            ))}
          </div>
          {storyRow && (
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">
                Portfolio at Year {storyRow.index}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                {show(storyRow.balance)}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-300">
                {yearStories.get(storyRow.index) ??
                  `Interest earned this year: ${show(storyRow.interest)}. Accrued interest: ${show(storyRow.accruedInterest)}.`}
              </p>
            </div>
          )}
        </div>

        {/* Benchmark Scenario Comparison */}
        <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand-bright" />
            <h4 className="text-sm font-semibold text-white">
              Alternative Scenarios Comparison
            </h4>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Same starting principal and time horizon under different investing paths.
          </p>
          {compareTakeaway && (
            <p className="mt-3 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-brand-bright">
              {compareTakeaway}
            </p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {compare.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5"
                style={{ borderTopColor: s.color, borderTopWidth: 2 }}
              >
                <p className="text-xs font-semibold text-white">{s.label}</p>
                <p className="text-xs text-zinc-400">{s.tagline}</p>
                <p
                  className="mt-2.5 text-lg font-bold tabular-nums"
                  style={{ color: s.color }}
                >
                  {show(s.result.futureValue)}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Gains: {show(s.result.totalInterest)}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Narrative Takeaways */}
        <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-bright" />
            <h4 className="text-sm font-semibold text-white">
              Key Insights & Observations
            </h4>
          </div>
          <ul className="mt-3 space-y-2">
            {narrative.map((line) => (
              <li
                key={line}
                className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2 text-xs leading-relaxed text-zinc-300"
              >
                {line}
              </li>
            ))}
          </ul>
        </div>

        {/* Full Yearly Breakdown Table */}
        <div className="overflow-hidden rounded-xl border border-brand-deep/30 bg-[#161618]/80">
          <div className="border-b border-zinc-800 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
              Year-by-Year Growth Table
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-2.5 font-medium">Year</th>
                  <th className="px-4 py-2.5 font-medium">Deposited Principal</th>
                  <th className="px-4 py-2.5 font-medium">Year Interest</th>
                  <th className="bg-orange-500/10 px-4 py-2.5 font-medium text-orange-300">
                    Cumulative Interest
                  </th>
                  <th className="bg-emerald-500/10 px-4 py-2.5 font-medium text-emerald-300">
                    End Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.yearly.map((row, i) => {
                  const isLast = i === result.yearly.length - 1;
                  const principalShown = row.balance - row.accruedInterest;
                  return (
                    <tr
                      key={row.index}
                      className={cn(
                        "border-b border-zinc-900 transition hover:bg-zinc-800/30",
                        isLast && "font-semibold text-white bg-zinc-800/20"
                      )}
                    >
                      <td className="px-4 py-2 text-zinc-300">{row.label}</td>
                      <td className="px-4 py-2 tabular-nums text-zinc-300">
                        {show(principalShown)}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-orange-400">
                        {show(row.interest)}
                      </td>
                      <td className="bg-orange-500/5 px-4 py-2 tabular-nums text-orange-300">
                        {show(row.accruedInterest)}
                      </td>
                      <td className="bg-emerald-500/5 px-4 py-2 tabular-nums font-semibold text-gain">
                        {show(row.balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
