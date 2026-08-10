"use client";

import {
  calculateCompound,
  COMPOUND_STORAGE_KEY,
  DEFAULT_COMPOUND_INPUTS,
  type CompoundInputs,
  type ContributionFrequency,
  type ContributionMode,
  type IncreaseMode,
  type RatePeriod,
} from "@/lib/compound-interest";
import { cn } from "@/lib/format";
import { blockWheelChange } from "@/lib/number-input";
import {
  ArrowUpRight,
  BarChart3,
  Calculator,
  LayoutGrid,
  PieChart,
  Table2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type CurrencyCode = "USD" | "EUR";

const CURRENCIES: { code: CurrencyCode; symbol: string }[] = [
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
];

type ViewMode = "table" | "chart" | "summary" | "pie";

export type CompoundSheetOption = {
  id: string;
  name: string;
  value: number;
};

type Props = {
  /** Full book total (all sheets). */
  bookValue: number;
  /** Per-portfolio live values for principal picker. */
  sheets: CompoundSheetOption[];
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

function money(value: number, currency: CurrencyCode, digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
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

export function CompoundInterestSheet({ bookValue, sheets }: Props) {
  const [draft, setDraft] = useState<CompoundInputs>(DEFAULT_COMPOUND_INPUTS);
  const [inputs, setInputs] = useState<CompoundInputs>(DEFAULT_COMPOUND_INPUTS);
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [principalSource, setPrincipalSource] = useState<string>("custom");
  const [view, setView] = useState<ViewMode>("table");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadStored();
    setDraft(stored);
    setInputs(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(COMPOUND_STORAGE_KEY, JSON.stringify(inputs));
    } catch {
      /* ignore */
    }
  }, [inputs, hydrated]);

  const result = useMemo(
    () => calculateCompound({ ...inputs, compound: "monthly" }),
    [inputs]
  );
  const displayRows = result.yearly;

  function patchDraft<K extends keyof CompoundInputs>(
    key: K,
    value: CompoundInputs[K]
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function calculate() {
    setInputs({ ...draft, compound: "monthly" });
  }

  function applyPrincipal(source: string) {
    setPrincipalSource(source);
    if (source === "book") {
      patchDraft("principal", Math.round(bookValue * 100) / 100);
      return;
    }
    if (source === "custom") return;
    const sheet = sheets.find((s) => s.id === source);
    if (sheet) {
      patchDraft("principal", Math.round(sheet.value * 100) / 100);
    }
  }

  const durationLabel =
    inputs.months > 0
      ? `${inputs.years} year${inputs.years === 1 ? "" : "s"}, ${inputs.months} month${inputs.months === 1 ? "" : "s"}`
      : `${inputs.years} year${inputs.years === 1 ? "" : "s"}`;

  const chartMax = Math.max(...result.yearly.map((r) => r.balance), 1);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(280px,340px)_1fr]">
      {/* Inputs */}
      <aside className="space-y-5 rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-5">
        <div>
          <h2 className="text-sm font-semibold text-white">Compound Interest</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Project growth of cash or your live book value.
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Currency
          </p>
          <div className="flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
            {CURRENCIES.map((c) => (
              <SegButton
                key={c.code}
                active={currency === c.code}
                onClick={() => setCurrency(c.code)}
              >
                {c.code}
              </SegButton>
            ))}
          </div>
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
                All portfolios ({money(bookValue, currency, 0)})
              </option>
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({money(s.value, currency, 0)})
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-xs text-zinc-400">
            Initial investment
            <input
              type="text"
              inputMode="decimal"
              value={draft.principal}
              onChange={(e) => {
                setPrincipalSource("custom");
                patchDraft(
                  "principal",
                  Number(e.target.value.replace(/[^\d.]/g, "")) || 0
                );
              }}
              onWheel={blockWheelChange}
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
            />
          </label>
          <p className="mt-1.5 text-[11px] text-zinc-600">
            Compounded monthly · deposit increase defaults to 2%/yr
          </p>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="block text-xs text-zinc-400">
            Interest rate
            <input
              type="text"
              inputMode="decimal"
              value={draft.ratePercent}
              onChange={(e) =>
                patchDraft(
                  "ratePercent",
                  Number(e.target.value.replace(/[^\d.]/g, "")) || 0
                )
              }
              onWheel={blockWheelChange}
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
              <option value="quarterly">quarterly</option>
              <option value="daily">daily</option>
            </select>
          </label>
        </div>

        <div>
          <p className="mb-1.5 text-xs text-zinc-400">Duration</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-zinc-500">
              Years
              <input
                type="text"
                inputMode="numeric"
                value={draft.years}
                onChange={(e) =>
                  patchDraft(
                    "years",
                    Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, "")) || 0))
                  )
                }
                onWheel={blockWheelChange}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
              />
            </label>
            <label className="text-[11px] text-zinc-500">
              Months
              <input
                type="text"
                inputMode="numeric"
                value={draft.months}
                onChange={(e) =>
                  patchDraft(
                    "months",
                    Math.min(
                      11,
                      Math.max(
                        0,
                        Math.floor(Number(e.target.value.replace(/\D/g, "")) || 0)
                      )
                    )
                  )
                }
                onWheel={blockWheelChange}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
              />
            </label>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs text-zinc-400">
            Regular contributions (optional)
          </p>
          <div className="mb-2 flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
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
            <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
              <label className="text-[11px] text-zinc-500">
                Deposit amount
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.depositAmount}
                  onChange={(e) =>
                    patchDraft(
                      "depositAmount",
                      Number(e.target.value.replace(/[^\d.]/g, "")) || 0
                    )
                  }
                  onWheel={blockWheelChange}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
                />
              </label>
              <label className="text-[11px] text-zinc-500">
                Frequency
                <select
                  value={draft.depositFrequency}
                  onChange={(e) =>
                    patchDraft(
                      "depositFrequency",
                      e.target.value as ContributionFrequency
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white outline-none focus:border-brand"
                >
                  <option value="monthly">monthly</option>
                  <option value="biweekly">biweekly</option>
                  <option value="quarterly">quarterly</option>
                  <option value="annually">annually</option>
                </select>
              </label>
            </div>
          )}

          {(draft.contributionMode === "withdrawals" ||
            draft.contributionMode === "both") && (
            <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
              <label className="text-[11px] text-zinc-500">
                Withdrawal amount
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.withdrawalAmount}
                  onChange={(e) =>
                    patchDraft(
                      "withdrawalAmount",
                      Number(e.target.value.replace(/[^\d.]/g, "")) || 0
                    )
                  }
                  onWheel={blockWheelChange}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
                />
              </label>
              <label className="text-[11px] text-zinc-500">
                Frequency
                <select
                  value={draft.withdrawalFrequency}
                  onChange={(e) =>
                    patchDraft(
                      "withdrawalFrequency",
                      e.target.value as ContributionFrequency
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white outline-none focus:border-brand"
                >
                  <option value="monthly">monthly</option>
                  <option value="biweekly">biweekly</option>
                  <option value="quarterly">quarterly</option>
                  <option value="annually">annually</option>
                </select>
              </label>
            </div>
          )}

          {draft.contributionMode !== "none" && (
            <div>
              <p className="mb-1 text-[11px] text-zinc-500">
                Annual contribution increase (optional)
              </p>
              <div className="flex gap-2">
                <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/50 p-0.5">
                  <SegButton
                    active={draft.increaseMode === "percent"}
                    onClick={() =>
                      patchDraft("increaseMode", "percent" as IncreaseMode)
                    }
                  >
                    %
                  </SegButton>
                  <SegButton
                    active={draft.increaseMode === "fixed"}
                    onClick={() =>
                      patchDraft("increaseMode", "fixed" as IncreaseMode)
                    }
                  >
                    $
                  </SegButton>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.annualIncrease}
                  onChange={(e) =>
                    patchDraft(
                      "annualIncrease",
                      Number(e.target.value.replace(/[^\d.]/g, "")) || 0
                    )
                  }
                  onWheel={blockWheelChange}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
                />
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={calculate}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gain px-4 py-2.5 text-sm font-semibold text-[#0a1f16] hover:brightness-110"
        >
          <Calculator className="h-4 w-4" />
          Calculate
        </button>
      </aside>

      {/* Results */}
      <section className="space-y-5">
        <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-6">
          <h3 className="text-base font-semibold text-white sm:text-lg">
            Interest calculation for {durationLabel}
          </h3>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Future investment value
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-gain sm:text-3xl">
                {money(result.futureValue, currency)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Total interest earned
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-orange-400 sm:text-3xl">
                {money(result.totalInterest, currency)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Initial balance
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-sky-400 sm:text-3xl">
                {money(result.principal, currency)}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 border-t border-zinc-800 pt-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-zinc-500">Yearly rate → compounded</p>
              <p className="mt-0.5 tabular-nums text-zinc-200">
                {(result.nominalAnnualRate * 100).toFixed(2)}% →{" "}
                {(result.effectiveAnnualRate * 100).toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">All-time rate of return</p>
              <p className="mt-0.5 inline-flex items-center gap-1 tabular-nums text-gain">
                {(result.allTimeRoR * 100).toFixed(2)}%
                <ArrowUpRight className="h-3.5 w-3.5" />
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Time to double (no contrib.)</p>
              <p className="mt-0.5 tabular-nums text-zinc-200">
                {Number.isFinite(result.doubleYears)
                  ? `${result.doubleYears} years, ${result.doubleMonths} months`
                  : "—"}
              </p>
            </div>
          </div>

          {result.totalContributions !== 0 && (
            <p className="mt-3 text-xs text-zinc-500">
              Net contributions:{" "}
              <span className="tabular-nums text-zinc-300">
                {money(result.totalContributions, currency)}
              </span>
            </p>
          )}
        </div>

        <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Yearly breakdown
            </p>
            <div className="flex gap-1">
              {(
                [
                  ["table", Table2],
                  ["chart", BarChart3],
                  ["summary", LayoutGrid],
                  ["pie", PieChart],
                ] as const
              ).map(([id, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  className={cn(
                    "rounded-md p-1.5 transition",
                    view === id
                      ? "bg-brand/20 text-brand-bright"
                      : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  )}
                  aria-label={id}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          {view === "table" && (
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
                  {displayRows.map((row, i) => {
                    const isLast = i === displayRows.length - 1;
                    return (
                      <tr
                        key={`${row.label}-${row.index}`}
                        className="border-b border-zinc-800/80 hover:bg-zinc-900/40"
                      >
                        <td className="px-4 py-2 tabular-nums text-zinc-300">
                          {row.index}
                        </td>
                        <td className="px-4 py-2 tabular-nums text-zinc-300">
                          {row.index === 0
                            ? "—"
                            : money(row.interest, currency)}
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
                            : money(row.accruedInterest, currency)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2 tabular-nums",
                            isLast
                              ? "bg-emerald-500/20 font-semibold text-gain"
                              : "text-zinc-100"
                          )}
                        >
                          {money(row.balance, currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {view === "chart" && (
            <div className="px-4 py-5">
              <svg
                viewBox="0 0 640 220"
                className="h-auto w-full"
                role="img"
                aria-label="Balance growth chart"
              >
                <defs>
                  <linearGradient id="ciFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {(() => {
                  const pts = result.yearly;
                  if (pts.length < 2) return null;
                  const w = 640;
                  const h = 200;
                  const pad = 16;
                  const coords = pts.map((p, i) => {
                    const x =
                      pad + (i / (pts.length - 1)) * (w - pad * 2);
                    const y =
                      h - pad - (p.balance / chartMax) * (h - pad * 2);
                    return `${x},${y}`;
                  });
                  const line = coords.join(" ");
                  const area = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`;
                  return (
                    <>
                      <polygon points={area} fill="url(#ciFill)" />
                      <polyline
                        points={line}
                        fill="none"
                        stroke="#34d399"
                        strokeWidth="2.5"
                      />
                    </>
                  );
                })()}
              </svg>
              <p className="mt-2 text-center text-xs text-zinc-500">
                Balance over {durationLabel}
              </p>
            </div>
          )}

          {view === "summary" && (
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {[
                ["Ending balance", money(result.futureValue, currency)],
                ["Interest earned", money(result.totalInterest, currency)],
                ["Starting principal", money(result.principal, currency)],
                [
                  "Net contributions",
                  money(result.totalContributions, currency),
                ],
                [
                  "Effective annual rate",
                  `${(result.effectiveAnnualRate * 100).toFixed(2)}%`,
                ],
                [
                  "All-time RoR",
                  `${(result.allTimeRoR * 100).toFixed(2)}%`,
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-3"
                >
                  <p className="text-xs text-zinc-500">{label}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {view === "pie" && (
            <div className="flex flex-col items-center gap-4 px-4 py-6 sm:flex-row sm:justify-center">
              {(() => {
                const interest = Math.max(0, result.totalInterest);
                const contrib = Math.max(0, result.totalContributions);
                const prin = Math.max(0, result.principal);
                const total = interest + contrib + prin || 1;
                const a1 = (prin / total) * 360;
                const a2 = a1 + (contrib / total) * 360;
                const toXY = (deg: number) => {
                  const rad = ((deg - 90) * Math.PI) / 180;
                  return [100 + 80 * Math.cos(rad), 100 + 80 * Math.sin(rad)];
                };
                const arc = (start: number, end: number, color: string) => {
                  if (end - start < 0.01) return null;
                  const [x1, y1] = toXY(start);
                  const [x2, y2] = toXY(end);
                  const large = end - start > 180 ? 1 : 0;
                  return (
                    <path
                      key={color}
                      d={`M 100 100 L ${x1} ${y1} A 80 80 0 ${large} 1 ${x2} ${y2} Z`}
                      fill={color}
                    />
                  );
                };
                return (
                  <>
                    <svg viewBox="0 0 200 200" className="h-44 w-44">
                      {arc(0, a1, "#38bdf8")}
                      {arc(a1, a2, "#c5a059")}
                      {arc(a2, 360, "#fb923c")}
                    </svg>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center gap-2 text-zinc-300">
                        <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                        Principal {money(prin, currency)}
                      </li>
                      <li className="flex items-center gap-2 text-zinc-300">
                        <span className="h-2.5 w-2.5 rounded-full bg-brand" />
                        Contributions {money(contrib, currency)}
                      </li>
                      <li className="flex items-center gap-2 text-zinc-300">
                        <span className="h-2.5 w-2.5 rounded-full bg-orange-400" />
                        Interest {money(interest, currency)}
                      </li>
                    </ul>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
