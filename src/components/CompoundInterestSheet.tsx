"use client";

import {
  COMPOUND_STORAGE_KEY,
  DEFAULT_COMPOUND_INPUTS,
  type CompoundInputs,
  type ContributionFrequency,
  type ContributionMode,
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
  storyYears,
  type CompareScenario,
  type MilestoneActuals,
  type ShockKind,
} from "@/lib/compound-play";
import { blendedExpectedAnnualReturn } from "@/lib/forecast-conviction";
import { cn, percent } from "@/lib/format";
import { PALETTE } from "@/lib/palette";
import { safeDiv } from "@/lib/money";
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
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTimeout } from "@/lib/use-timeout";
import {
  Card,
  InfoTip,
  MicroLabel,
  Panel,
  PanelHeader,
  Pill,
  Score,
  Scoreboard,
  Segmented,
} from "@/components/ui/Panel";
import { ChartXRail, ChartYAxis } from "@/components/ui/ChartAxis";

type CurrencyCode = DisplayCurrency;

function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return hex;
  return `rgba(${r},${g},${b},${alpha})`;
}

const CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: "USD", label: "USD" },
  { code: "EUR", label: "EUR" },
];

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-well px-3 py-2.5 text-sm font-semibold text-foreground outline-none focus:border-brand";

const YEAR_PRESETS = [5, 10, 20, 30] as const;
const RATE_PRESETS = [
  { id: "book", label: "This portfolio" },
  { id: "spy", label: "S&P 500" },
  { id: "15", label: "15%" },
  { id: "25", label: "25%" },
] as const;

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
  /** Skip the covered-call boost in the compare path. */
  hideOptions?: boolean;
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

function ComparePathsChart({
  scenarios,
  currency,
  eurUsd,
  tippingYear,
}: {
  scenarios: CompareScenario[];
  currency: CurrencyCode;
  eurUsd: number | null;
  tippingYear: number | null;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const paths = scenarios.map((s) => ({
    id: s.id,
    label: s.label,
    color: s.color,
    series: s.result.yearly.map((y) => y.balance),
    dashed: s.id === "mattress",
    thick: s.id === "upside",
  }));
  const lastIdx = Math.max(1, ...paths.map((p) => p.series.length - 1));
  const max = Math.max(1, ...paths.flatMap((p) => p.series));
  const w = 640;
  const h = 240;
  const padL = 8;
  const padR = 12;
  const padT = 16;
  const padB = 8;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

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

  const labels = paths.map((p) => p.label).join(", ");

  const yTicks = gridSteps.map((s) => max * s);

  return (
    <div className="relative">
      <div className="flex items-stretch gap-3">
        <ChartYAxis
          ticks={yTicks}
          yAt={yAt}
          height={h}
          format={compact}
          className="w-16"
        />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${w} ${h}`}
          className="h-auto min-w-0 flex-1 touch-pan-y"
          role="img"
          aria-label={`Same money four ways: ${labels}`}
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
        {gridSteps.map((s) => {
          const y = padT + plotH - s * plotH;
          return (
            <line
              key={s}
              x1={padL}
              x2={w - padR}
              y1={y}
              y2={y}
              stroke="#2b2b2b"
              strokeWidth="1"
            />
          );
        })}

        {tippingYear != null && tippingYear <= lastIdx && (
          <line
            x1={xAt(tippingYear)}
            x2={xAt(tippingYear)}
            y1={padT}
            y2={padT + plotH}
            stroke={PALETTE.gain}
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.6"
          />
        )}

        {paths.map((p) => (
          <polyline
            key={p.id}
            points={toPoints(p.series)}
            fill="none"
            stroke={p.color}
            strokeWidth={p.thick ? 2.5 : 2}
            strokeDasharray={p.dashed ? "6 4" : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {hoverIdx != null && (
          <g pointerEvents="none">
            <line
              x1={xAt(hoverIdx)}
              x2={xAt(hoverIdx)}
              y1={padT}
              y2={padT + plotH}
              stroke={PALETTE.muted}
              strokeWidth="1"
              strokeDasharray="2 3"
              opacity="0.7"
            />
            {paths.map((p) => (
              <circle
                key={p.id}
                cx={xAt(hoverIdx)}
                cy={yAt(p.series[hoverIdx] ?? 0)}
                r={p.thick ? 4 : 3.25}
                fill={p.color}
                stroke={PALETTE.app}
                strokeWidth="1.5"
              />
            ))}
          </g>
        )}
      </svg>
      </div>
      <ChartXRail railClassName="w-16">
        {yearTicks.map((i) => {
          const isFirst = i === 0;
          const isLast = i === lastIdx;
          return (
            <span
              key={i}
              className="absolute top-0"
              style={{
                left: `${((xAt(i) - padL) / plotW) * 100}%`,
                transform: isFirst
                  ? "translateX(0)"
                  : isLast
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
              }}
            >
              Y{i}
            </span>
          );
        })}
      </ChartXRail>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-muted sm:grid-cols-4">
        {paths.map((p) => (
          <li key={p.id} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-3.5"
              style={{
                borderTop: p.dashed
                  ? `1.5px dashed ${p.color}`
                  : `2px solid ${p.color}`,
              }}
              aria-hidden
            />
            {p.label}
          </li>
        ))}
      </ul>
      {hoverIdx != null && (
        <div
          className="pointer-events-none absolute top-2 rounded-md border border-border bg-card/95 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur"
          style={{
            left: `${Math.min(
              82,
              Math.max(18, ((xAt(hoverIdx) - padL) / plotW) * 100)
            )}%`,
            transform: "translateX(-50%)",
          }}
        >
          <p className="font-semibold text-foreground">Year {hoverIdx}</p>
          {paths.map((p) => (
            <p
              key={p.id}
              className="tabular-nums"
              style={{ color: p.color }}
            >
              {p.label}: {money(p.series[hoverIdx] ?? 0, currency, eurUsd, 0)}
            </p>
          ))}
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
  hideOptions = true,
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
  const later = useTimeout();

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

  useLayoutEffect(() => {
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
    () => buildCompareScenarios(liveInputs, hideOptions ? 0 : 6),
    [liveInputs, hideOptions]
  );
  const compareTakeaway = useMemo(() => buildCompareTakeaway(compare), [compare]);
  const narrative = useMemo(() => buildNarrative(result), [result]);

  const storyOpts = useMemo(
    () => storyYears(Math.max(liveInputs.years, 1)),
    [liveInputs.years]
  );

  const safeStoryIdx = Math.min(storyIdx, Math.max(storyOpts.length - 1, 0));
  const storyYear = storyOpts[safeStoryIdx] ?? 1;

  useEffect(() => {
    if (storyIdx !== safeStoryIdx) setStoryIdx(safeStoryIdx);
  }, [storyIdx, safeStoryIdx]);

  useEffect(() => {
    if (principalSource === "custom" || principalSource === "book") return;
    if (!sheets.some((s) => s.id === principalSource)) {
      setPrincipalSource("custom");
    }
  }, [principalSource, sheets]);
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
      later(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  const durationLabel =
    liveInputs.months > 0
      ? `${liveInputs.years}y ${liveInputs.months}m`
      : `${liveInputs.years} year${liveInputs.years === 1 ? "" : "s"}`;

  const isRateMatchedToPortfolio = Math.abs(draft.ratePercent - portfolioExpectedRatePct) < 0.05;
  const annualRateInput =
    draft.ratePeriod === "annual" ? draft.ratePercent : draft.ratePercent * 12;
  const ratePreset = isRateMatchedToPortfolio
    ? "book"
    : annualRateInput === 10
      ? "spy"
      : annualRateInput === 15
        ? "15"
        : annualRateInput === 25
          ? "25"
          : null;
  const yearPreset = YEAR_PRESETS.includes(
    draft.years as (typeof YEAR_PRESETS)[number]
  )
    ? String(draft.years)
    : null;

  function applyRatePreset(id: (typeof RATE_PRESETS)[number]["id"]) {
    if (id === "book") {
      syncToPortfolioRate();
      return;
    }
    patchDraft("ratePeriod", "annual");
    if (id === "spy") patchDraft("ratePercent", 10);
    else if (id === "15") patchDraft("ratePercent", 15);
    else patchDraft("ratePercent", 25);
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(320px,380px)_1fr]">
      {/* min-h-0: grid items won't shrink below content, so overflow never starts. */}
      <div className="min-h-0 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-6rem-var(--dock-pad))] lg:overflow-y-auto lg:overscroll-y-contain lg:[-webkit-overflow-scrolling:touch]">
        <Panel>
        <PanelHeader
          icon={<Calculator className="h-4 w-4" />}
          title="Growth calculator"
          actions={
            <Segmented
              ariaLabel="Show amounts in"
              options={CURRENCIES.map((c) => ({
                id: c.code,
                label: c.label,
                title: c.code === "EUR" ? fxHint : "Your portfolio is kept in USD",
              }))}
              value={currency}
              onChange={setCurrencySafe}
            />
          }
        />

        <div className="mt-6 divide-y divide-white/10">
        <section className="space-y-3 pb-5">
          <label htmlFor="compound-principal-input" className="text-sm font-semibold text-foreground">
            Starting from
          </label>
          <FormattedNumberInput
            id="compound-principal-input"
            kind="money"
            currency={currency}
            value={usdToDisplay(draft.principal, currency, eurUsd)}
            onChange={(n) => {
              setPrincipalSource("custom");
              onMoneyUsdChange(n, (usd) => patchDraft("principal", usd));
            }}
            className={FIELD_CLASS}
          />
          <select
            value={principalSource}
            onChange={(e) => applyPrincipal(e.target.value)}
            aria-label="Where the starting amount comes from"
            className="w-full rounded-lg border border-border bg-well px-3 py-2.5 text-sm text-foreground outline-none focus:border-brand"
          >
            {bookValue > 0 && (
              <option value="book">
                This portfolio ({show(bookValue, 0)})
              </option>
            )}
            {sheets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({show(s.value, 0)})
              </option>
            ))}
            <option value="custom">Type an amount</option>
          </select>
        </section>

        <section className="space-y-3 py-5">
          <label htmlFor="compound-rate-input" className="text-sm font-semibold text-foreground">
            Growing at
          </label>
          <div className="relative">
            <FormattedNumberInput
              id="compound-rate-input"
              kind="percent"
              value={annualRateInput}
              onChange={(n) => {
                patchDraft("ratePercent", Math.max(0, n));
                patchDraft("ratePeriod", "annual");
              }}
              className={cn(FIELD_CLASS, "pr-16")}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
              a year
            </span>
          </div>
          <Segmented
            ariaLabel="Growth rate preset"
            columns={2}
            options={RATE_PRESETS}
            value={ratePreset}
            onChange={applyRatePreset}
          />
        </section>

        <section className="space-y-3 py-5">
          <label htmlFor="compound-duration-input" className="text-sm font-semibold text-foreground">
            For how long
          </label>
          <div className="relative">
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
              className={cn(FIELD_CLASS, "no-spinner pr-16")}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
              years
            </span>
          </div>
          <Segmented
            ariaLabel="How many years"
            columns={2}
            options={YEAR_PRESETS.map((yr) => ({
              id: String(yr),
              label: `${yr} years`,
            }))}
            value={yearPreset}
            onChange={(id) => patchDraft("years", Number(id))}
          />
        </section>

        <section
          className={cn(
            "space-y-3 py-5 transition",
            tipFlash && "rounded-lg bg-gain/[0.06]"
          )}
        >
          <span className="text-sm font-semibold text-foreground">
            Adding along the way
          </span>
          <Segmented
            ariaLabel="Deposits or withdrawals"
            columns={2}
            options={[
              { id: "deposits", label: "Paying in" },
              { id: "none", label: "None" },
              { id: "withdrawals", label: "Taking out" },
              { id: "both", label: "Both" },
            ]}
            value={draft.contributionMode}
            onChange={(id) =>
              patchDraft("contributionMode", id as ContributionMode)
            }
          />

          {(draft.contributionMode === "deposits" ||
            draft.contributionMode === "both") && (
            <div className="space-y-3">
              <FormattedNumberInput
                id="compound-deposit-input"
                kind="money"
                currency={currency}
                value={usdToDisplay(draft.depositAmount, currency, eurUsd)}
                onChange={(n) =>
                  onMoneyUsdChange(n, (usd) => patchDraft("depositAmount", usd))
                }
                className={FIELD_CLASS}
              />
              <Segmented
                ariaLabel="How often you pay in"
                columns={2}
                options={[
                  { id: "monthly", label: "A month" },
                  { id: "annually", label: "A year" },
                ]}
                value={draft.depositFrequency}
                onChange={(id) =>
                  patchDraft("depositFrequency", id as ContributionFrequency)
                }
              />
              <label className="flex items-center justify-between gap-3 text-sm text-muted">
                Raise it each year
                <FormattedNumberInput
                  kind="percent"
                  value={draft.annualIncrease}
                  onChange={(n) => patchDraft("annualIncrease", n)}
                  className="w-24 rounded-lg border border-border bg-well px-2 py-2 text-sm font-semibold text-foreground outline-none focus:border-brand"
                />
              </label>
              {tipping != null && (
                <p className="text-sm text-muted">
                  From year {tipping}, growth adds more than you do.
                </p>
              )}
            </div>
          )}

          {(draft.contributionMode === "withdrawals" ||
            draft.contributionMode === "both") && (
            <label className="block text-sm text-muted">
              Taking out each month
              <FormattedNumberInput
                kind="money"
                currency={currency}
                value={usdToDisplay(draft.withdrawalAmount, currency, eurUsd)}
                onChange={(n) =>
                  onMoneyUsdChange(n, (usd) =>
                    patchDraft("withdrawalAmount", usd)
                  )
                }
                className={cn(FIELD_CLASS, "mt-1.5")}
              />
            </label>
          )}
        </section>

        <section className="space-y-3 pt-5">
          <span className="text-sm font-semibold text-foreground">
            If it starts badly
          </span>
          <Segmented
            ariaLabel="Rough start"
            columns={3}
            options={[
              { id: "none", label: "Even years" },
              { id: "drawdown30", label: "Crash first" },
              { id: "flat2y", label: "Slow start" },
            ]}
            value={shock}
            onChange={setShock}
          />
          {shock === "drawdown30" && (
            <p className="text-sm leading-relaxed text-muted">
              Down 30% in year one, then your rate. The ending is worse because the drop hits when the pile is biggest.
            </p>
          )}
          {shock === "flat2y" && (
            <p className="text-sm leading-relaxed text-muted">
              Two quiet years first. Those two years cost more than they look like.
            </p>
          )}
        </section>
        </div>
        </Panel>
      </div>

      {/* Results & Projections Section */}
      <section className="space-y-5">
        {/* Hero KPI Summary */}
        <Panel>
          <PanelHeader
            hero
            title={`Where ${durationLabel} of this gets you`}
            actions={
              <button
                type="button"
                onClick={() => void copyPostcard()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground/80 transition hover:border-brand hover:text-foreground"
              >
                {copied ? (
                  <Copy className="h-3.5 w-3.5 text-gain" />
                ) : (
                  <Share2 className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied" : "Copy summary"}
              </button>
            }
          />

          {/* Three numbers, and the sentence that ties them together. Anything
            * more here and the first thing a person sees is a wall. */}
          <div className="mt-5">
            <MicroLabel>Ends up at</MicroLabel>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gain">
              {show(result.futureValue)}
            </p>
          </div>
          <Scoreboard className="mt-5" cols={2}>
            <Score
              label="Of that, growth"
              value={show(result.totalInterest)}
              explain="Money the market made for you, on top of everything you put in yourself."
              valueClassName="text-caution"
            />
            <Score
              label="You put in"
              value={show(result.principal + result.totalDeposited)}
              valueClassName="text-brand-bright"
            />
          </Scoreboard>

          <p className="mt-3 text-sm leading-relaxed text-foreground/80">
            You put in {show(result.principal + result.totalDeposited)} and end
            with {show(result.futureValue)}, so growth did{" "}
            {show(result.totalInterest)} of the work
            {result.futureValue > 0
              ? `, which is ${percent(safeDiv(result.totalInterest, result.futureValue), 0)} of the final number`
              : ""}
            .
          </p>

          <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <div>
              <MicroLabel>
                Total return
                <InfoTip text="How much bigger the pot is than everything you put into it." />
              </MicroLabel>
              <p className="mt-0.5 inline-flex items-center gap-1 text-sm font-semibold tabular-nums text-gain">
                {(result.allTimeRoR * 100).toFixed(1)}%
                <ArrowUpRight className="h-3.5 w-3.5" />
              </p>
            </div>
            <div>
              <MicroLabel>Doubles in</MicroLabel>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                {Number.isFinite(result.doubleYears)
                  ? `${result.doubleYears}y ${result.doubleMonths}m`
                  : "—"}
              </p>
            </div>
            <div>
              <MicroLabel>
                Growth overtakes you
                <InfoTip text="The year growth starts adding more than you pay in yourself. After this, time matters more than saving harder." />
              </MicroLabel>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                {tipping != null ? `Year ${tipping}` : "Not while you keep paying in"}
              </p>
            </div>
          </div>
        </Panel>

        {/* Dual Path Chart */}
        <Panel>
          <PanelHeader
            title="Same money, four paths"
            actions={
              tipping != null ? (
                <Pill tone="good" title="From here on, growth adds more each year than you do">
                  Growth takes over in year {tipping}
                </Pill>
              ) : undefined
            }
          />
          <div className="mt-4">
            <ComparePathsChart
              scenarios={compare}
              currency={currency}
              eurUsd={eurUsd}
              tippingYear={tipping}
            />
          </div>
        </Panel>

        {/* Milestone Tracker */}
        <Panel>
          <PanelHeader
            icon={<Target className="h-4 w-4" />}
            title="When you cross each round number"
          />
          {milestoneTakeaway && (
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {milestoneTakeaway}
            </p>
          )}
          <div
            ref={milestoneScrollRef}
            className="relative mt-4 max-h-[24rem] overflow-y-auto overflow-x-auto rounded-lg border border-border bg-raised"
          >
            <table className="w-full min-w-[30rem] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border text-xs text-muted">
                  <th className="py-2.5 px-3 font-medium">Milestone</th>
                  <th className="py-2.5 px-3 font-medium">On this plan</th>
                  <th className="py-2.5 px-3 font-medium">How far off</th>
                  <th className="py-2.5 px-3 font-medium">Got there on</th>
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
                          "border-b border-border transition hover:bg-hover/30",
                          done && "bg-gain/[0.06]"
                        )}
                      >
                        <td className="py-2.5 px-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-2 tabular-nums font-medium",
                              done ? "font-semibold text-gain" : "text-foreground"
                            )}
                          >
                            {done ? (
                              <CheckCircle2
                                className="h-4 w-4 shrink-0 text-gain"
                                aria-hidden
                              />
                            ) : (
                              <span
                                className="inline-block h-3.5 w-3.5 shrink-0 rounded border border-brand-mid bg-transparent"
                                aria-hidden
                              />
                            )}
                            {show(row.goal)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 tabular-nums text-foreground/80">
                          {row.hit ? (
                            <span className="font-semibold text-gain">
                              Already past it
                            </span>
                          ) : row.targetDate ? (
                            formatMilestoneDate(row.targetDate)
                          ) : (
                            "More than 50 years out"
                          )}
                        </td>
                        <td className="py-2.5 px-3 tabular-nums text-foreground/80">
                          {row.hit
                            ? "—"
                            : row.yearsUntil != null
                              ? `${row.yearsUntil.toFixed(1)} years`
                              : "—"}
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="date"
                            aria-label={`Date you reached ${show(row.goal)}`}
                            value={row.actualDate ?? ""}
                            onChange={(e) =>
                              setMilestoneActual(row.goal, e.target.value)
                            }
                            className={cn(
                              "max-w-[9.5rem] rounded border bg-well px-1.5 py-1 text-xs tabular-nums outline-none focus:border-brand",
                              done
                                ? "border-gain/40 text-gain"
                                : "border-border text-foreground/80"
                            )}
                          />
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Any single year, in words"
          />
          <Segmented
            ariaLabel="Year to read"
            className="mt-3"
            columns={
              storyOpts.length <= 3
                ? Math.max(storyOpts.length, 1)
                : storyOpts.length === 4
                  ? 2
                  : storyOpts.length === 5
                    ? 5
                    : 3
            }
            options={storyOpts.map((y) => ({
              id: String(y),
              label: `Year ${y}`,
              title:
                tipping === y
                  ? `Year ${y}, growth takes over`
                  : `Year ${y}`,
            }))}
            value={String(storyYear)}
            onChange={(id) => {
              const i = storyOpts.indexOf(Number(id));
              if (i >= 0) setStoryIdx(i);
            }}
          />
          {storyRow && (
            <Card tone="raised" className="mt-4 p-4">
              <MicroLabel>After year {storyRow.index}</MicroLabel>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {show(storyRow.balance)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-foreground/80">
                {yearStories.get(storyRow.index) ??
                  `Growth added ${show(storyRow.interest)} this year, ${show(storyRow.accruedInterest)} in total so far.`}
              </p>
            </Card>
          )}

          {/* The full grid used to be its own panel below. Same numbers, so it
            * lives here folded up instead of as a seventh thing to scroll past. */}
          <details className="mt-4 rounded-xl border border-border bg-raised">
            <summary className="cursor-pointer px-3.5 py-2.5 text-sm font-medium text-foreground/80 transition hover:text-foreground">
              Show every year as a table
            </summary>
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[32rem] text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="px-4 py-2.5 font-medium">Year</th>
                    <th className="px-4 py-2.5 font-medium">Your money in</th>
                    <th className="px-4 py-2.5 font-medium">Growth that year</th>
                    <th className="bg-caution/15 px-4 py-2.5 font-medium text-caution">
                      Growth so far
                    </th>
                    <th className="bg-gain/10 px-4 py-2.5 font-medium text-gain">
                      Pot at year end
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
                          "border-b border-border transition hover:bg-hover/30",
                          isLast && "bg-hover/20 font-semibold text-foreground"
                        )}
                      >
                        <td className="px-4 py-2 text-foreground/80">{row.label}</td>
                        <td className="px-4 py-2 tabular-nums text-foreground/80">
                          {show(principalShown)}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-caution">
                          {show(row.interest)}
                        </td>
                        <td className="bg-caution/10 px-4 py-2 tabular-nums text-caution">
                          {show(row.accruedInterest)}
                        </td>
                        <td className="bg-gain/5 px-4 py-2 tabular-nums font-semibold text-gain">
                          {show(row.balance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </Panel>

        <Panel>
          <PanelHeader
            icon={<Zap className="h-4 w-4" />}
            title="The same money, invested differently"
          />
          {compareTakeaway && (
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {compareTakeaway}
            </p>
          )}
          <div className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {compare.map((s) => {
              const featured = s.id === "upside";
              const dashed = s.id === "mattress";
              return (
                <div
                  key={s.id}
                  className="px-4 py-3.5"
                  style={{
                    background: `linear-gradient(180deg, ${tint(s.color, featured ? 0.16 : 0.08)} 0%, ${tint(s.color, featured ? 0.05 : 0.02)} 100%)`,
                    boxShadow: `inset 3px 0 0 ${s.color}`,
                  }}
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span
                      className="inline-block w-3.5 shrink-0"
                      style={{
                        borderTop: dashed
                          ? `1.5px dashed ${s.color}`
                          : `2px solid ${s.color}`,
                      }}
                      aria-hidden
                    />
                    {s.label}
                  </p>
                  <p
                    className="mt-2 text-lg font-semibold leading-none tabular-nums whitespace-nowrap"
                    style={{ color: s.color }}
                  >
                    {show(s.result.futureValue)}
                  </p>
                  <p className="mt-2 text-sm tabular-nums text-muted">
                    {show(s.result.totalInterest)} growth
                  </p>
                  <p className="mt-2 text-sm leading-snug text-muted">
                    {s.tagline}
                  </p>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            icon={<Sparkles className="h-4 w-4" />}
            title="What this actually tells you"
          />
          <ul className="mt-3 space-y-2">
            {narrative.map((line) => (
              <li
                key={line}
                className="rounded-lg border border-border bg-raised px-3 py-2 text-sm leading-relaxed text-foreground/80"
              >
                {line}
              </li>
            ))}
          </ul>
        </Panel>

      </section>
    </div>
  );
}
