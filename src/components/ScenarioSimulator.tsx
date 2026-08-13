"use client";

import {
  SHOCKS,
  analyzePortfolioShock,
  type ShockId,
} from "@/lib/book-shock";
import { cashtag, cn, currency, percent } from "@/lib/format";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Cpu,
  DollarSign,
  Flame,
  Layers,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";

type Props = {
  holdings: {
    ticker: string;
    shares: number;
    price: number;
  }[];
  cash: number;
  scopeLabel: string;
};

type SortField = "delta" | "move" | "liveVal" | "ticker";

const DRIVER_ICONS: Record<string, typeof Activity> = {
  Baseline: Activity,
  "Rates & Duration": TrendingUp,
  "Tech Valuation": Cpu,
  Commodities: Flame,
  "AI Infrastructure": Zap,
  "Digital Assets": Snowflake,
  Liquidity: TrendingDown,
  "Foreign Exchange": DollarSign,
  "Supply Chain": ShieldAlert,
  "Risk Expansion": Sparkles,
};

export function ScenarioSimulator({ holdings, cash, scopeLabel }: Props) {
  const [selectedShock, setSelectedShock] = useState<ShockId>("ai_down20");
  const [sortField, setSortField] = useState<SortField>("delta");
  const [sortAsc, setSortAsc] = useState(true);

  const analysis = useMemo(() => {
    return analyzePortfolioShock(holdings, cash, selectedShock);
  }, [holdings, cash, selectedShock]);

  const sortedRows = useMemo(() => {
    const list = [...analysis.rows];
    list.sort((a, b) => {
      let diff = 0;
      if (sortField === "delta") diff = a.deltaVal - b.deltaVal;
      else if (sortField === "move") diff = a.movePct - b.movePct;
      else if (sortField === "liveVal") diff = b.liveVal - a.liveVal;
      else if (sortField === "ticker") diff = a.ticker.localeCompare(b.ticker);
      return sortAsc ? diff : -diff;
    });
    return list;
  }, [analysis.rows, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === "delta" || field === "move");
    }
  };

  const activeScenario = analysis.scenario;
  const DriverIcon = DRIVER_ICONS[activeScenario.driver] ?? Activity;

  return (
    <div className="space-y-4">
      {/* Header & Scenario Selector */}
      <div className="rounded-xl border border-zinc-800 bg-[#161618]/90 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand/20 text-brand-bright ring-1 ring-brand/40">
                <Shield className="h-3.5 w-3.5" />
              </span>
              <p className="text-sm font-semibold text-white">
                Macro Scenario Simulator
              </p>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Stress-test your book against real macroeconomic shifts. Each asset
              responds by its valuation duration, AI CapEx exposure, energy
              dependence, and crypto correlation.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-right">
            <span className="text-[10px] uppercase tracking-wider text-zinc-400">
              Active Scope
            </span>
            <p className="text-xs font-medium text-zinc-200">{scopeLabel}</p>
          </div>
        </div>

        {/* 1-Tap Scenario Selector Chips */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {SHOCKS.map((s) => {
            const Icon = DRIVER_ICONS[s.driver] ?? Activity;
            const isSelected = selectedShock === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedShock(s.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition",
                  isSelected
                    ? "bg-brand/25 text-brand-bright ring-1 ring-inset ring-brand/50 shadow-sm shadow-brand/10"
                    : "border border-zinc-800/80 bg-zinc-900/40 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                )}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isSelected ? "text-brand-bright" : "text-zinc-400"
                  )}
                />
                <span>{s.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Active Scenario Context Banner */}
        {selectedShock !== "none" && (
          <div className="mt-4 rounded-xl border border-zinc-800/70 bg-zinc-900/40 p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/60 pb-2.5">
              <div className="flex items-center gap-2">
                <DriverIcon className="h-4 w-4 text-brand-bright" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
                  {activeScenario.label}
                </h3>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                  {activeScenario.driver}
                </span>
              </div>
              <span className="text-xs text-zinc-400">
                Headline driver:{" "}
                <span className="font-semibold text-zinc-200">
                  {activeScenario.headlinePct > 0 ? "+" : ""}
                  {(activeScenario.headlinePct * 100).toFixed(0)}%
                </span>
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-300">
              {activeScenario.mechanism}
            </p>
          </div>
        )}
      </div>

      {/* KPI Cards: Valuation, Margin/Leverage, & Key Factors */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Portfolio Value Impact */}
        <div className="rounded-xl border border-zinc-800 bg-[#161618]/90 p-4">
          <p className="text-[11px] uppercase tracking-wider text-zinc-400">
            Modeled Portfolio Value
          </p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-lg font-bold tabular-nums text-white">
              {currency(analysis.shockedTotalVal, 0)}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
                analysis.deltaVal >= 0 ? "text-gain" : "text-loss"
              )}
            >
              {analysis.deltaVal >= 0 ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              {percent(analysis.deltaPct)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-zinc-800/60 pt-2 text-xs text-zinc-400">
            <span>Live: {currency(analysis.liveTotalVal, 0)}</span>
            <span
              className={cn(
                "font-medium tabular-nums",
                analysis.deltaVal >= 0 ? "text-gain" : "text-loss"
              )}
            >
              {analysis.deltaVal >= 0 ? "+" : ""}
              {currency(analysis.deltaVal, 0)}
            </span>
          </div>
        </div>

        {/* Card 2: Leverage & Margin Safety / Dry Powder */}
        <div className="rounded-xl border border-zinc-800 bg-[#161618]/90 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-wider text-zinc-400">
              {analysis.margin.isUsingMargin ? "Margin & Leverage" : "Cash & Dry Powder"}
            </p>
            {analysis.margin.isUsingMargin ? (
              analysis.margin.marginCallRisk === "critical" ? (
                <span className="flex items-center gap-1 rounded-md bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300 ring-1 ring-rose-500/40">
                  <ShieldAlert className="h-3 w-3" /> Call Risk
                </span>
              ) : analysis.margin.marginCallRisk === "caution" ? (
                <span className="flex items-center gap-1 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 ring-1 ring-amber-500/40">
                  <AlertTriangle className="h-3 w-3" /> Tight Buffer
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/40">
                  <ShieldCheck className="h-3 w-3" /> Safe Buffer
                </span>
              )
            ) : (
              <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                100% Cash Covered
              </span>
            )}
          </div>

          {analysis.margin.isUsingMargin ? (
            <>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold tabular-nums text-white">
                  {analysis.margin.shockedLeverage.toFixed(2)}x
                </span>
                <span className="text-xs tabular-nums text-zinc-400">
                  Debt {analysis.margin.shockedDebtToEquityPct.toFixed(0)}% of equity
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-zinc-800/60 pt-2 text-xs text-zinc-400">
                <span>30% Margin Cushion</span>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    analysis.margin.shockedEquityCushion > 0 ? "text-zinc-200" : "text-rose-400"
                  )}
                >
                  {currency(analysis.margin.shockedEquityCushion, 0)}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold tabular-nums text-white">
                  {analysis.margin.shockedCashPct.toFixed(1)}%
                </span>
                <span className="text-xs tabular-nums text-zinc-400">
                  {currency(analysis.cash, 0)} cash
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-zinc-800/60 pt-2 text-xs text-zinc-400">
                <span>Dip Purchasing Power</span>
                <span className="font-medium text-brand-bright">
                  +{((analysis.margin.shockedCashPct - analysis.margin.liveCashPct)).toFixed(1)}% expanded
                </span>
              </div>
            </>
          )}
        </div>

        {/* Card 3: Top Downside Risk */}
        <div className="rounded-xl border border-zinc-800 bg-[#161618]/90 p-4">
          <p className="text-[11px] uppercase tracking-wider text-zinc-400">
            Heaviest Exposure
          </p>
          {analysis.topVulnerability ? (
            <>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-base font-bold text-white">
                  {cashtag(analysis.topVulnerability.ticker)}
                </span>
                <span className="text-xs font-semibold tabular-nums text-loss">
                  {currency(analysis.topVulnerability.deltaVal, 0)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-zinc-800/60 pt-2 text-xs text-zinc-400">
                <span className="truncate pr-1">{analysis.topVulnerability.label}</span>
                <span className="shrink-0 font-medium tabular-nums text-zinc-300">
                  {percent(analysis.topVulnerability.movePct)}
                </span>
              </div>
            </>
          ) : (
            <div className="mt-3 text-xs text-zinc-400">
              No holdings in this scope.
            </div>
          )}
        </div>

        {/* Card 4: Most Resilient / Shock Absorber */}
        <div className="rounded-xl border border-zinc-800 bg-[#161618]/90 p-4">
          <p className="text-[11px] uppercase tracking-wider text-zinc-400">
            Shock Absorber
          </p>
          {analysis.topShockAbsorber ? (
            <>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-base font-bold text-white">
                  {cashtag(analysis.topShockAbsorber.ticker)}
                </span>
                <span
                  className={cn(
                    "text-xs font-semibold tabular-nums",
                    analysis.topShockAbsorber.deltaVal >= 0 ? "text-gain" : "text-zinc-300"
                  )}
                >
                  {analysis.topShockAbsorber.deltaVal >= 0 ? "+" : ""}
                  {currency(analysis.topShockAbsorber.deltaVal, 0)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-zinc-800/60 pt-2 text-xs text-zinc-400">
                <span className="truncate pr-1">{analysis.topShockAbsorber.label}</span>
                <span
                  className={cn(
                    "shrink-0 font-medium tabular-nums",
                    analysis.topShockAbsorber.movePct >= 0 ? "text-gain" : "text-zinc-300"
                  )}
                >
                  {percent(analysis.topShockAbsorber.movePct)}
                </span>
              </div>
            </>
          ) : (
            <div className="mt-3 text-xs text-zinc-400">
              No holdings in this scope.
            </div>
          )}
        </div>
      </div>

      {/* Tactical Takeaways & PM Observations */}
      {analysis.tacticalNotes.length > 0 && (
        <div className="rounded-xl border border-zinc-800/80 bg-[#161618]/80 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-bright" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
              Tactical Playbook & Observations
            </h4>
          </div>
          <ul className="mt-2.5 space-y-1.5">
            {analysis.tacticalNotes.map((note, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs leading-relaxed text-zinc-300"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-bright" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Thematic Impact Breakdown */}
      {analysis.themeBreakdown.length > 1 && selectedShock !== "none" && (
        <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-zinc-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
              Impact by Asset Theme
            </h4>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {analysis.themeBreakdown.map((t) => (
              <div
                key={t.theme}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-3 py-2 text-xs"
              >
                <span className="truncate text-zinc-300">{t.theme}</span>
                <span
                  className={cn(
                    "shrink-0 font-semibold tabular-nums",
                    t.deltaVal >= 0 ? "text-gain" : "text-loss"
                  )}
                >
                  {t.deltaVal >= 0 ? "+" : ""}
                  {currency(t.deltaVal, 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Holdings Breakdown Table */}
      <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-white">
              Position Stress Test Breakdown
            </h4>
            <p className="mt-0.5 text-xs text-zinc-400">
              Asset moves reflect individual factor sensitivities, not flat numbers.
            </p>
          </div>
          <span className="text-xs text-zinc-400">
            {sortedRows.length} {sortedRows.length === 1 ? "position" : "positions"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left text-xs">
            <thead className="text-zinc-400">
              <tr className="border-b border-zinc-800">
                <th
                  onClick={() => handleSort("ticker")}
                  className="cursor-pointer py-2 pr-2 font-medium hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    <span>Ticker</span>
                    {sortField === "ticker" && <ChevronDown className="h-3 w-3" />}
                  </div>
                </th>
                <th className="py-2 pr-2 font-medium">Theme</th>
                <th
                  onClick={() => handleSort("move")}
                  className="cursor-pointer py-2 pr-2 font-medium hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    <span>Modeled Move</span>
                    {sortField === "move" && <ChevronDown className="h-3 w-3" />}
                  </div>
                </th>
                <th className="py-2 pr-2 font-medium">Live Mark</th>
                <th className="py-2 pr-2 font-medium">Shocked Mark</th>
                <th
                  onClick={() => handleSort("liveVal")}
                  className="cursor-pointer py-2 pr-2 font-medium hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    <span>Live Position</span>
                    {sortField === "liveVal" && <ChevronDown className="h-3 w-3" />}
                  </div>
                </th>
                <th className="py-2 pr-2 font-medium">Shocked Position</th>
                <th
                  onClick={() => handleSort("delta")}
                  className="cursor-pointer py-2 font-medium hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    <span>Dollar Impact (Δ)</span>
                    {sortField === "delta" && <ChevronDown className="h-3 w-3" />}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr
                  key={r.ticker}
                  className="border-b border-zinc-900/80 transition hover:bg-zinc-800/30"
                >
                  <td className="py-2 pr-2 font-semibold text-white">
                    {cashtag(r.ticker)}
                  </td>
                  <td className="max-w-[11rem] truncate py-2 pr-2 text-zinc-400">
                    {r.label}
                  </td>
                  <td className="py-2 pr-2 tabular-nums">
                    <span
                      className={cn(
                        "inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                        r.movePct === 0
                          ? "bg-zinc-800 text-zinc-400"
                          : r.movePct > 0
                            ? "bg-emerald-950/60 text-emerald-300 ring-1 ring-emerald-500/30"
                            : "bg-rose-950/60 text-rose-300 ring-1 ring-rose-500/30"
                      )}
                    >
                      {r.movePct > 0 ? "+" : ""}
                      {percent(r.movePct)}
                    </span>
                  </td>
                  <td className="py-2 pr-2 tabular-nums text-zinc-400">
                    {currency(r.livePx, 2)}
                  </td>
                  <td className="py-2 pr-2 tabular-nums font-medium text-zinc-200">
                    {currency(r.shockPx, 2)}
                  </td>
                  <td className="py-2 pr-2 tabular-nums text-zinc-400">
                    {currency(r.liveVal, 0)}
                  </td>
                  <td className="py-2 pr-2 tabular-nums text-zinc-300">
                    {currency(r.shockVal, 0)}
                  </td>
                  <td
                    className={cn(
                      "py-2 tabular-nums font-semibold",
                      r.deltaVal === 0
                        ? "text-zinc-400"
                        : r.deltaVal > 0
                          ? "text-gain"
                          : "text-loss"
                    )}
                  >
                    {r.deltaVal > 0 ? "+" : ""}
                    {currency(r.deltaVal, 0)}
                  </td>
                </tr>
              ))}
              {sortedRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-zinc-400">
                    No active stock holdings in this scope.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
