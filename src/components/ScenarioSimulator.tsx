"use client";

import {
  SHOCKS,
  analyzePortfolioShock,
  type ShockId,
} from "@/lib/book-shock";
import { cashtag, cn, currency, percent } from "@/lib/format";
import { Card, MicroLabel, Panel, PanelHeader, Pill } from "@/components/ui/Panel";
import {
  Activity,
  ChevronDown,
  Cpu,
  DollarSign,
  Flame,
  Layers,
  Shield,
  ShieldAlert,
  Snowflake,
  TrendingDown,
  TrendingUp,
  Sparkles,
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
  "Interest rates": TrendingUp,
  "Tech prices": Cpu,
  "Oil and energy": Flame,
  "AI computers": Sparkles,
  Crypto: Snowflake,
  "Everyone selling": TrendingDown,
  "The dollar": DollarSign,
  Factories: ShieldAlert,
  "People buying": Layers,
};

export function ScenarioSimulator({ holdings, cash }: Props) {
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
    <div className="space-y-6">
      <Panel>
        <PanelHeader
          icon={<Shield className="h-4 w-4" />}
          title="What a bad day costs you"
        />

        <div className="mt-4 flex flex-wrap gap-1.5">
          {SHOCKS.map((s) => {
            const Icon = DRIVER_ICONS[s.driver] ?? Activity;
            const isSelected = selectedShock === s.id;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedShock(s.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition",
                  isSelected
                    ? "bg-brand/25 text-brand-bright ring-1 ring-inset ring-brand/50"
                    : "border border-zinc-800/80 bg-zinc-950/40 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                )}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isSelected ? "text-brand-bright" : "text-zinc-400"
                  )}
                  aria-hidden
                />
                {s.shortLabel}
              </button>
            );
          })}
        </div>

        {selectedShock !== "none" && (
          <Card className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/60 pb-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <DriverIcon
                  className="h-4 w-4 shrink-0 text-brand-bright"
                  aria-hidden
                />
                <h3 className="text-sm font-semibold text-white">
                  {activeScenario.label}
                </h3>
                <Pill tone="neutral">{activeScenario.driver}</Pill>
              </div>
              <span className="text-xs text-zinc-400">
                Headline move{" "}
                <span className="font-semibold tabular-nums text-zinc-200">
                  {activeScenario.headlinePct > 0 ? "+" : ""}
                  {(activeScenario.headlinePct * 100).toFixed(0)}%
                </span>
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              {activeScenario.mechanism}
            </p>
          </Card>
        )}
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel tone="plain" padded={false} className="p-4">
          <MicroLabel>Book after this</MicroLabel>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-lg font-semibold tabular-nums text-white">
              {currency(analysis.shockedTotalVal, 0)}
            </span>
            <span
              className={cn(
                "text-xs font-semibold tabular-nums",
                analysis.deltaVal >= 0 ? "text-gain" : "text-loss"
              )}
            >
              {percent(analysis.deltaPct)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-800/60 pt-2 text-xs text-zinc-400">
            <span>Today {currency(analysis.liveTotalVal, 0)}</span>
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
        </Panel>

        <Panel tone="plain" padded={false} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <MicroLabel>
              {analysis.margin.isUsingMargin
                ? "Borrowed money"
                : "Cash"}
            </MicroLabel>
            {analysis.margin.isUsingMargin ? (
              analysis.margin.marginCallRisk === "critical" ? (
                <Pill tone="bad">Broker could force a sale</Pill>
              ) : analysis.margin.marginCallRisk === "caution" ? (
                <Pill tone="warn">Getting tight</Pill>
              ) : (
                <Pill tone="good">Comfortable</Pill>
              )
            ) : (
              <Pill tone="neutral">Nothing borrowed</Pill>
            )}
          </div>

          {analysis.margin.isUsingMargin ? (
            <>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-lg font-semibold tabular-nums text-white">
                  {analysis.margin.shockedLeverage.toFixed(2)}x
                </span>
                <span className="text-xs tabular-nums text-zinc-400">
                  You owe {analysis.margin.shockedDebtToEquityPct.toFixed(0)}%
                  of what you own
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-800/60 pt-2 text-xs text-zinc-400">
                <span>Room before a margin call</span>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    analysis.margin.shockedEquityCushion > 0
                      ? "text-zinc-200"
                      : "text-loss"
                  )}
                >
                  {currency(analysis.margin.shockedEquityCushion, 0)}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-lg font-semibold tabular-nums text-white">
                  {currency(analysis.cash, 0)}
                </span>
                <span className="text-xs tabular-nums text-zinc-400">
                  {analysis.margin.shockedCashPct.toFixed(1)}% of the book
                  after this
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-800/60 pt-2 text-xs text-zinc-400">
                {analysis.cash > 0 ? (
                  <>
                    <span>Doesn&apos;t fall with the stocks</span>
                    {analysis.margin.shockedCashPct -
                      analysis.margin.liveCashPct >
                    0.05 ? (
                      <span className="tabular-nums text-zinc-300">
                        Was {analysis.margin.liveCashPct.toFixed(1)}%
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span>No cash sitting out as a buffer</span>
                )}
              </div>
            </>
          )}
        </Panel>

        <Panel tone="plain" padded={false} className="p-4">
          <MicroLabel>Hurts most</MicroLabel>
          {analysis.topVulnerability ? (
            <>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-lg font-semibold text-white">
                  {cashtag(analysis.topVulnerability.ticker)}
                </span>
                <span className="text-xs font-semibold tabular-nums text-loss">
                  {currency(analysis.topVulnerability.deltaVal, 0)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-800/60 pt-2 text-xs text-zinc-400">
                <span className="truncate pr-1">
                  {analysis.topVulnerability.label}
                </span>
                <span className="shrink-0 font-medium tabular-nums text-zinc-300">
                  {percent(analysis.topVulnerability.movePct)}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">Nothing held here yet.</p>
          )}
        </Panel>

        <Panel tone="plain" padded={false} className="p-4">
          <MicroLabel>Holds up best</MicroLabel>
          {analysis.topShockAbsorber ? (
            <>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-lg font-semibold text-white">
                  {cashtag(analysis.topShockAbsorber.ticker)}
                </span>
                <span
                  className={cn(
                    "text-xs font-semibold tabular-nums",
                    analysis.topShockAbsorber.deltaVal >= 0
                      ? "text-gain"
                      : "text-zinc-300"
                  )}
                >
                  {analysis.topShockAbsorber.deltaVal >= 0 ? "+" : ""}
                  {currency(analysis.topShockAbsorber.deltaVal, 0)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-800/60 pt-2 text-xs text-zinc-400">
                <span className="truncate pr-1">
                  {analysis.topShockAbsorber.label}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-medium tabular-nums",
                    analysis.topShockAbsorber.movePct >= 0
                      ? "text-gain"
                      : "text-zinc-300"
                  )}
                >
                  {percent(analysis.topShockAbsorber.movePct)}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">Nothing held here yet.</p>
          )}
        </Panel>
      </div>

      {analysis.themeBreakdown.length > 1 && selectedShock !== "none" && (
        <Panel tone="plain">
          <h3 className="text-base font-semibold text-white">
            Where the damage lands
          </h3>
          <p className="mt-1 text-sm text-zinc-400">
            Your holdings pooled by what they actually bet on.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {analysis.themeBreakdown.map((t) => (
              <div
                key={t.theme}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2 text-sm"
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
        </Panel>
      )}

      <Panel tone="plain">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-white">
              Every position
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              Sorted by the biggest dollar change. Tap a column to re-sort.
            </p>
          </div>
          <span className="text-sm text-zinc-400">
            {sortedRows.length}{" "}
            {sortedRows.length === 1 ? "position" : "positions"}
          </span>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-400">
                <th
                  onClick={() => handleSort("ticker")}
                  className="cursor-pointer py-2 pr-2 font-medium hover:text-white"
                >
                  <span className="flex items-center gap-1">
                    Ticker
                    {sortField === "ticker" && (
                      <ChevronDown className="h-3 w-3" aria-hidden />
                    )}
                  </span>
                </th>
                <th className="py-2 pr-2 font-medium">Bet</th>
                <th
                  onClick={() => handleSort("move")}
                  className="cursor-pointer py-2 pr-2 font-medium hover:text-white"
                >
                  <span className="flex items-center gap-1">
                    Move
                    {sortField === "move" && (
                      <ChevronDown className="h-3 w-3" aria-hidden />
                    )}
                  </span>
                </th>
                <th className="py-2 pr-2 font-medium">Price now</th>
                <th className="py-2 pr-2 font-medium">Price after</th>
                <th
                  onClick={() => handleSort("liveVal")}
                  className="cursor-pointer py-2 pr-2 font-medium hover:text-white"
                >
                  <span className="flex items-center gap-1">
                    Value now
                    {sortField === "liveVal" && (
                      <ChevronDown className="h-3 w-3" aria-hidden />
                    )}
                  </span>
                </th>
                <th className="py-2 pr-2 font-medium">Value after</th>
                <th
                  onClick={() => handleSort("delta")}
                  className="cursor-pointer py-2 font-medium hover:text-white"
                >
                  <span className="flex items-center gap-1">
                    Change
                    {sortField === "delta" && (
                      <ChevronDown className="h-3 w-3" aria-hidden />
                    )}
                  </span>
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
                  <td className="py-2 pr-2">
                    <span
                      className={cn(
                        "inline-block rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums",
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
                  <td className="py-2 pr-2 font-medium tabular-nums text-zinc-200">
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
                      "py-2 font-semibold tabular-nums",
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
                  <td
                    colSpan={8}
                    className="py-6 text-center text-sm text-zinc-400"
                  >
                    Nothing held in this scope yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
