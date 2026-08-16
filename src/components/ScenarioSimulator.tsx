"use client";

import {
  SHOCKS,
  analyzePortfolioShock,
  type ShockId,
} from "@/lib/book-shock";
import { cashtag, cn, currency, percent } from "@/lib/format";
import { Card, EmptyState, MicroLabel, Panel, PanelHeader, Pill } from "@/components/ui/Panel";
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
  "AI computer builders": Sparkles,
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

  if (holdings.length === 0) {
    return (
      <EmptyState
        title="Nothing to stress yet"
        detail="Add a holding and this shows what a rough day would do to your portfolio."
      />
    );
  }

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
                  "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                  isSelected
                    ? "bg-select text-select-ink"
                    : "border border-border bg-well/60 text-muted hover:bg-hover hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isSelected ? "text-select-ink" : "text-muted"
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <DriverIcon
                  className="h-4 w-4 shrink-0 text-brand-bright"
                  aria-hidden
                />
                <h3 className="text-sm font-semibold text-foreground">
                  {activeScenario.label}
                </h3>
                <Pill tone="neutral">{activeScenario.driver}</Pill>
              </div>
              <span className="text-xs text-muted">
                Headline move{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {activeScenario.headlinePct > 0 ? "+" : ""}
                  {(activeScenario.headlinePct * 100).toFixed(0)}%
                </span>
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-foreground/80">
              {activeScenario.mechanism}
            </p>
          </Card>
        )}
      </Panel>

      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <MicroLabel>Portfolio after this</MicroLabel>
          <p className="mt-1.5 font-sans text-2xl font-semibold leading-none tabular-nums text-foreground">
            {currency(analysis.shockedTotalVal, 0)}
          </p>
          <p
            className={cn(
              "mt-1.5 text-sm font-semibold tabular-nums",
              analysis.deltaVal >= 0 ? "text-gain" : "text-loss"
            )}
          >
            {percent(analysis.deltaPct)}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Today {currency(analysis.liveTotalVal, 0)}.{" "}
            <span
              className={cn(
                "font-medium tabular-nums",
                analysis.deltaVal >= 0 ? "text-gain" : "text-loss"
              )}
            >
              {analysis.deltaVal >= 0 ? "+" : ""}
              {currency(analysis.deltaVal, 0)}
            </span>
          </p>
        </Card>

        <Card>
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
              <p className="mt-1.5 font-sans text-2xl font-semibold leading-none tabular-nums text-foreground">
                {analysis.margin.shockedLeverage.toFixed(2)}x
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                You owe {analysis.margin.shockedDebtToEquityPct.toFixed(0)}%
                of what you own. Room before a forced sale:{" "}
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    analysis.margin.shockedEquityCushion > 0
                      ? "text-foreground"
                      : "text-loss"
                  )}
                >
                  {currency(analysis.margin.shockedEquityCushion, 0)}
                </span>
              </p>
            </>
          ) : (
            <>
              <p className="mt-1.5 font-sans text-2xl font-semibold leading-none tabular-nums text-foreground">
                {currency(analysis.cash, 0)}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {analysis.margin.shockedCashPct.toFixed(1)}% of your portfolio
                after this
                {analysis.cash > 0
                  ? ". Does not fall with the stocks."
                  : ". No cash sitting out as a buffer."}
              </p>
            </>
          )}
        </Card>

        <Card>
          <MicroLabel>Hurts most</MicroLabel>
          {analysis.topVulnerability ? (
            <>
              <p className="mt-1.5 font-sans text-2xl font-semibold leading-none text-foreground">
                {cashtag(analysis.topVulnerability.ticker)}
              </p>
              <p className="mt-1.5 text-sm font-semibold tabular-nums text-loss">
                {currency(analysis.topVulnerability.deltaVal, 0)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {analysis.topVulnerability.label} ·{" "}
                {percent(analysis.topVulnerability.movePct)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">Nothing held here yet.</p>
          )}
        </Card>

        <Card>
          <MicroLabel>Holds up best</MicroLabel>
          {analysis.topShockAbsorber ? (
            <>
              <p className="mt-1.5 font-sans text-2xl font-semibold leading-none text-foreground">
                {cashtag(analysis.topShockAbsorber.ticker)}
              </p>
              <p
                className={cn(
                  "mt-1.5 text-sm font-semibold tabular-nums",
                  analysis.topShockAbsorber.deltaVal >= 0
                    ? "text-gain"
                    : "text-foreground/80"
                )}
              >
                {analysis.topShockAbsorber.deltaVal >= 0 ? "+" : ""}
                {currency(analysis.topShockAbsorber.deltaVal, 0)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {analysis.topShockAbsorber.label} ·{" "}
                {percent(analysis.topShockAbsorber.movePct)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">Nothing held here yet.</p>
          )}
        </Card>
      </div>

      {analysis.themeBreakdown.length > 1 && selectedShock !== "none" && (
        <Panel tone="plain">
          <h3 className="text-base font-semibold text-foreground">
            Where the damage lands
          </h3>
          <p className="mt-1 text-sm text-muted">
            Your holdings pooled by what they actually bet on.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {analysis.themeBreakdown.map((t) => (
              <div
                key={t.theme}
                className="flex h-full items-center justify-between gap-3 rounded-lg border border-border bg-raised px-3 py-2 text-sm"
              >
                <span className="truncate text-foreground/80">{t.theme}</span>
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
            <h3 className="text-base font-semibold text-foreground">
              Every position
            </h3>
            <p className="mt-1 text-sm text-muted">
              Sorted by the biggest dollar change. Tap a column to re-sort.
            </p>
          </div>
          <span className="text-sm text-muted">
            {sortedRows.length}{" "}
            {sortedRows.length === 1 ? "position" : "positions"}
          </span>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th
                  onClick={() => handleSort("ticker")}
                  className="cursor-pointer py-2 pr-2 font-medium hover:text-foreground"
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
                  className="cursor-pointer py-2 pr-2 font-medium hover:text-foreground"
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
                  className="cursor-pointer py-2 pr-2 font-medium hover:text-foreground"
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
                  className="cursor-pointer py-2 font-medium hover:text-foreground"
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
                  className="border-b border-border transition hover:bg-hover/30"
                >
                  <td className="py-2 pr-2 font-semibold text-foreground">
                    {cashtag(r.ticker)}
                  </td>
                  <td className="max-w-[11rem] truncate py-2 pr-2 text-muted">
                    {r.label}
                  </td>
                  <td className="py-2 pr-2">
                    <span
                      className={cn(
                        "inline-block rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                        r.movePct === 0
                          ? "bg-hover text-muted"
                          : r.movePct > 0
                            ? "bg-gain/15 text-gain ring-1 ring-gain/30"
                            : "bg-loss/15 text-loss ring-1 ring-loss/30"
                      )}
                    >
                      {r.movePct > 0 ? "+" : ""}
                      {percent(r.movePct)}
                    </span>
                  </td>
                  <td className="py-2 pr-2 tabular-nums text-muted">
                    {currency(r.livePx, 2)}
                  </td>
                  <td className="py-2 pr-2 font-medium tabular-nums text-foreground">
                    {currency(r.shockPx, 2)}
                  </td>
                  <td className="py-2 pr-2 tabular-nums text-muted">
                    {currency(r.liveVal, 0)}
                  </td>
                  <td className="py-2 pr-2 tabular-nums text-foreground/80">
                    {currency(r.shockVal, 0)}
                  </td>
                  <td
                    className={cn(
                      "py-2 font-semibold tabular-nums",
                      r.deltaVal === 0
                        ? "text-muted"
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
                    className="py-6 text-center text-sm text-muted"
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
