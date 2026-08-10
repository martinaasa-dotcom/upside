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
  buildNarrative,
  calculateWithShock,
  estimateYearsToGoal,
  findTippingYear,
  goalProgress,
  stayTheCourseInputs,
  storyYears,
  yearsToGoal,
  type ShockKind,
} from "@/lib/compound-play";
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
  Copy,
  Share2,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
}: {
  stay: number[];
  active: number[];
  currency: CurrencyCode;
  eurUsd: number | null;
}) {
  const max = Math.max(...stay, ...active, 1);
  const w = 640;
  const h = 200;
  const pad = 16;

  const toPoints = (series: number[]) =>
    series
      .map((v, i) => {
        const x = pad + (i / Math.max(series.length - 1, 1)) * (w - pad * 2);
        const y = h - pad - (v / max) * (h - pad * 2);
        return `${x},${y}`;
      })
      .join(" ");

  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full"
        role="img"
        aria-label="Stay the course vs active path"
      >
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
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 border-t-2 border-dashed border-zinc-500" />
          Stay the course · {money(stay[stay.length - 1] ?? 0, currency, eurUsd)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-gain">
          <span className="h-0.5 w-4 bg-gain" />
          Active path · {money(active[active.length - 1] ?? 0, currency, eurUsd)}
        </span>
      </div>
    </div>
  );
}

export function CompoundInterestSheet({
  bookValue,
  sheets,
  eurUsd = null,
  eurUsdDetail = null,
}: Props) {
  const [draft, setDraft] = useState<CompoundInputs>(DEFAULT_COMPOUND_INPUTS);
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [principalSource, setPrincipalSource] = useState<string>("custom");
  const [hydrated, setHydrated] = useState(false);
  const [shock, setShock] = useState<ShockKind>("none");
  const [goal, setGoal] = useState(100_000);
  const [storyIdx, setStoryIdx] = useState(0);
  const [tipFlash, setTipFlash] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const stored = loadStored();
    setDraft(stored);
    setCurrency(loadCompoundCurrency());
    setHydrated(true);
  }, []);

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

  const liveInputs: CompoundInputs = useMemo(
    () => ({ ...draft, compound: "monthly" }),
    [draft]
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

  const narrative = useMemo(() => buildNarrative(result), [result]);

  const storyOpts = useMemo(
    () => storyYears(Math.max(liveInputs.years, 1)),
    [liveInputs.years]
  );

  const storyYear = storyOpts[Math.min(storyIdx, storyOpts.length - 1)] ?? 1;
  const storyRow =
    result.yearly.find((y) => y.index === storyYear) ??
    result.yearly[result.yearly.length - 1];

  const goalYear = yearsToGoal(result.yearly, goal);
  const progress = goalProgress(result.futureValue, goal);
  const etaYears = estimateYearsToGoal({
    principal: liveInputs.principal,
    goal,
    annualRatePct:
      liveInputs.ratePeriod === "annual"
        ? liveInputs.ratePercent
        : liveInputs.ratePercent * 12,
    monthlyDeposit:
      liveInputs.contributionMode === "deposits" ||
      liveInputs.contributionMode === "both"
        ? liveInputs.depositAmount
        : 0,
  });

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

  function setDepositLive(amount: number) {
    setDraft((prev) => ({
      ...prev,
      depositAmount: amount,
      contributionMode:
        amount > 0
          ? prev.contributionMode === "none"
            ? "deposits"
            : prev.contributionMode
          : prev.contributionMode === "deposits"
            ? "none"
            : prev.contributionMode,
    }));
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
  const chartMax = Math.max(...result.yearly.map((r) => r.balance), 1);

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
              "mt-1.5 text-[10px] tabular-nums",
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

        {/* 4 — Contribution drama dial */}
        <div
          className={cn(
            "rounded-xl border p-3 transition",
            tipFlash
              ? "border-gain/50 bg-gain/10"
              : "border-zinc-800 bg-zinc-900/40"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-300">
              Monthly deposit dial
            </p>
            {tipping != null && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gain">
                Tip year {tipping}
              </span>
            )}
          </div>
          <input
            type="range"
            min={0}
            max={2000}
            step={50}
            value={Math.min(2000, draft.depositAmount)}
            onChange={(e) => setDepositLive(Number(e.target.value))}
            className="mt-3 w-full accent-[var(--brand)]"
          />
          <div className="mt-1 flex justify-between text-[11px] text-zinc-500">
            <span>{show(0)}</span>
            <span className="tabular-nums text-brand-bright">
              {show(draft.depositAmount)}/mo
            </span>
            <span>{show(2000)}</span>
          </div>
          <label className="mt-3 block text-[11px] text-zinc-500">
            Annual deposit increase %
            <FormattedNumberInput
              kind="percent"
              value={draft.annualIncrease}
              onChange={(n) => patchDraft("annualIncrease", n)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white outline-none focus:border-brand"
            />
          </label>
        </div>

        <div>
          <p className="mb-1.5 text-xs text-zinc-400">Contributions</p>
          <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
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
          {(draft.contributionMode === "withdrawals" ||
            draft.contributionMode === "both") && (
            <label className="mt-2 block text-[11px] text-zinc-500">
              Withdrawal / mo
              <FormattedNumberInput
                kind="money"
                currency={currency}
                value={usdToDisplay(draft.withdrawalAmount, currency, eurUsd)}
                onChange={(n) =>
                  onMoneyUsdChange(n, (usd) => patchDraft("withdrawalAmount", usd))
                }
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white outline-none focus:border-brand"
              />
            </label>
          )}
          {(draft.contributionMode === "deposits" ||
            draft.contributionMode === "both") && (
            <label className="mt-2 block text-[11px] text-zinc-500">
              Deposit frequency
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
            />
          </div>
        </div>

        {/* 2 — Milestone race */}
        <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Target className="h-4 w-4 text-brand" />
            <h4 className="text-sm font-semibold text-white">Milestone race</h4>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[50_000, 100_000, 250_000, 500_000, 1_000_000].map((g) => (
              <SegButton
                key={g}
                active={goal === g}
                onClick={() => setGoal(g)}
              >
                {show(g)}
              </SegButton>
            ))}
          </div>
          <label className="mt-3 block text-[11px] text-zinc-500">
            Custom goal
            <FormattedNumberInput
              kind="money"
              currency={currency}
              value={usdToDisplay(goal, currency, eurUsd)}
              onChange={(n) =>
                onMoneyUsdChange(n, (usd) => setGoal(Math.round(usd)))
              }
              className="mt-1 w-full max-w-xs rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
            />
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-5">
            <div
              className="relative grid h-24 w-24 place-items-center rounded-full"
              style={{
                background: `conic-gradient(var(--gain) ${Math.min(progress, 1) * 360}deg, #27272a 0)`,
              }}
            >
              <div className="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full bg-[#161618] text-center">
                <span className="text-sm font-semibold tabular-nums text-white">
                  {Math.min(progress * 100, 999).toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="text-sm text-zinc-300">
              <p>
                End of horizon:{" "}
                <span className="font-semibold text-white">
                  {show(result.futureValue)}
                </span>
                {" / "}
                {show(goal)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {goalYear != null
                  ? `Hits goal in year ${goalYear} on this path.`
                  : etaYears != null
                    ? `At this pace, roughly ${etaYears} years to the goal.`
                    : "Won’t reach this goal in the current horizon — extend years or dial deposits."}
              </p>
            </div>
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
                {storyRow.index === 0
                  ? "Starting line — nothing compounded yet."
                  : storyRow.interest > storyRow.contributions &&
                      storyRow.contributions > 0
                    ? `Interest this year (${show(storyRow.interest)}) beats deposits (${show(storyRow.contributions)}). Money is working harder than you.`
                    : `Interest earned this year: ${show(storyRow.interest)}. Accrued interest: ${show(storyRow.accruedInterest)}.`}
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
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
              Explain like I’m impatient
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
          {/* Mini area chart */}
          <div className="border-t border-zinc-800 px-4 py-4">
            <svg
              viewBox="0 0 640 120"
              className="h-auto w-full"
              aria-hidden
            >
              <defs>
                <linearGradient id="ciFill2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                </linearGradient>
              </defs>
              {(() => {
                const pts = result.yearly;
                if (pts.length < 2) return null;
                const w = 640;
                const h = 110;
                const pad = 8;
                const coords = pts.map((p, i) => {
                  const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
                  const y = h - pad - (p.balance / chartMax) * (h - pad * 2);
                  return `${x},${y}`;
                });
                const line = coords.join(" ");
                const area = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`;
                return (
                  <>
                    <polygon points={area} fill="url(#ciFill2)" />
                    <polyline
                      points={line}
                      fill="none"
                      stroke="#34d399"
                      strokeWidth="2"
                    />
                  </>
                );
              })()}
            </svg>
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
