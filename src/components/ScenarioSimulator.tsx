"use client";

import {
  SHOCKS,
  analyzePortfolioShock,
  type ShockId,
} from "@/lib/book-shock";
import { FluidRow, FluidTable, cellBase, cellTicker, tableCols } from "@/components/FluidTable";
import { TickerSymbol } from "@/components/TickerSymbol";
import { listingCurrenciesAreMixed } from "@/lib/listing-currency";
import { cashtag, cn, currency, percent, signedCurrency, signedPercent, signedTone } from "@/lib/format";
import { Card, EmptyState, HairlineGrid, MicroLabel, Panel, PanelHeader, Pill, Score, Scoreboard, SPLIT_COPY, SPLIT_ROW } from "@/components/ui/Panel";
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

type SortField = "delta" | "move" | "ticker";

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
      else if (sortField === "ticker") diff = a.ticker.localeCompare(b.ticker);
      return sortAsc ? diff : -diff;
    });
    return list;
  }, [analysis.rows, sortField, sortAsc]);

  const mixedListings = listingCurrenciesAreMixed(
    holdings.map((h) => ({ ticker: h.ticker }))
  );
  const tickerCell = mixedListings ? cellTicker : cellBase;
  const template = tableCols(5, mixedListings);

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
    <div className="flex flex-col gap-6">
      <Panel>
        <PanelHeader
          icon={<Shield className="h-4 w-4" />}
          title="What a bad day costs you"
        />

        <HairlineGrid className="mt-4" mobilePreferred={2} preferred={5}>
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
                  "flex min-w-0 items-center justify-center gap-1.5 bg-muted px-2 py-2.5 text-sm font-medium transition",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isSelected ? "text-primary-foreground" : "text-muted-foreground"
                  )}
                  aria-hidden
                />
                <span className="truncate">{s.shortLabel}</span>
              </button>
            );
          })}
        </HairlineGrid>

        <Card className="mt-4 min-h-[8.5rem]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <DriverIcon
                  className="h-4 w-4 shrink-0 text-primary"
                  aria-hidden
                />
                <h3 className="text-sm font-semibold text-foreground">
                  {activeScenario.label}
                </h3>
                <Pill tone="neutral">{activeScenario.driver}</Pill>
              </div>
              <span className="text-sm text-muted-foreground">
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

        <div className="mt-4">
          <MicroLabel>Portfolio after this</MicroLabel>
          <p className="mt-1 break-all text-2xl font-bold tabular-nums text-foreground">
            {currency(analysis.shockedTotalVal, 0)}
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            <span
              className={cn(
                "font-semibold tabular-nums",
                signedTone(analysis.deltaVal)
              )}
            >
              {signedPercent(analysis.deltaPct)}
            </span>
            <span className="text-muted-foreground">
              {" "}
              · {signedCurrency(analysis.deltaVal, 0)} from today&apos;s{" "}
              {currency(analysis.liveTotalVal, 0)}
            </span>
          </p>
          {analysis.margin.isUsingMargin ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {analysis.margin.marginCallRisk === "critical" ? (
                <Pill tone="bad">Broker could force a sale</Pill>
              ) : analysis.margin.marginCallRisk === "caution" ? (
                <Pill tone="warn">Getting tight</Pill>
              ) : (
                <Pill tone="good">Comfortable</Pill>
              )}
              <p className="text-sm text-muted-foreground">
                {analysis.margin.shockedLeverage.toFixed(2)}x borrowed. Room
                before a forced sale:{" "}
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
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {analysis.cash > 0
                ? `Cash ${currency(analysis.cash, 0)} · ${analysis.margin.shockedCashPct.toFixed(1)}% of the book after this.`
                : "No cash sitting out as a buffer."}
            </p>
          )}
        </div>

        <Scoreboard className="mt-4" cols={2}>
          <Score
            label="Hurts most"
            value={
              analysis.topVulnerability
                ? cashtag(analysis.topVulnerability.ticker)
                : "—"
            }
            sub={
              analysis.topVulnerability
                ? `${signedCurrency(analysis.topVulnerability.deltaVal, 0)} · ${percent(analysis.topVulnerability.movePct)}`
                : "Nothing held here yet."
            }
            subClassName={
              analysis.topVulnerability
                ? signedTone(analysis.topVulnerability.deltaVal)
                : undefined
            }
          />
          <Score
            label="Holds up best"
            value={
              analysis.topShockAbsorber
                ? cashtag(analysis.topShockAbsorber.ticker)
                : "—"
            }
            sub={
              analysis.topShockAbsorber
                ? `${signedCurrency(analysis.topShockAbsorber.deltaVal, 0)} · ${percent(analysis.topShockAbsorber.movePct)}`
                : "Nothing held here yet."
            }
            subClassName={
              analysis.topShockAbsorber &&
              analysis.topShockAbsorber.deltaVal >= 0
                ? "text-gain"
                : "text-muted-foreground"
            }
          />
        </Scoreboard>
      </Panel>

      {analysis.themeBreakdown.length > 1 && selectedShock !== "none" && (
        <Panel tone="plain">
          <h3 className="text-base font-semibold text-foreground">
            Where the damage lands
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Your holdings pooled by what they actually bet on.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {analysis.themeBreakdown.map((t) => (
              <div
                key={t.theme}
                className="flex h-full items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm"
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
        <div className={SPLIT_ROW}>
          <div className={SPLIT_COPY}>
            <h3 className="text-base font-semibold text-foreground">
              Every position
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Sorted by the biggest dollar change. Tap a column to re-sort.
            </p>
          </div>
          <span className="text-sm text-muted-foreground">
            {sortedRows.length}{" "}
            {sortedRows.length === 1 ? "position" : "positions"}
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-3 md:hidden">
          {sortedRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nothing held in this scope yet.
            </p>
          ) : (
            sortedRows.map((r) => (
              <Card key={r.ticker}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-base font-semibold text-foreground">
                    <TickerSymbol
                      ticker={r.ticker}
                      showCurrency={mixedListings}
                    />
                  </p>
                  <p
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      r.deltaVal === 0
                        ? "text-muted-foreground"
                        : r.deltaVal > 0
                          ? "text-gain"
                          : "text-loss"
                    )}
                  >
                    {r.deltaVal > 0 ? "+" : ""}
                    {currency(r.deltaVal, 0)}
                  </p>
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {r.label}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Move</p>
                    <p
                      className={cn(
                        "font-medium tabular-nums",
                        r.movePct === 0
                          ? "text-muted-foreground"
                          : r.movePct > 0
                            ? "text-gain"
                            : "text-loss"
                      )}
                    >
                      {r.movePct > 0 ? "+" : ""}
                      {percent(r.movePct)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">After</p>
                    <p className="tabular-nums text-foreground">
                      {currency(r.shockVal, 0)}
                    </p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        <div className="mt-3 hidden md:block">
          {sortedRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nothing held in this scope yet.
            </p>
          ) : (
            <FluidTable template={template}>
              <FluidRow className="text-sm font-medium text-muted-foreground">
                <button
                  type="button"
                  onClick={() => handleSort("ticker")}
                  className={cn(
                    tickerCell,
                    "hover:text-foreground",
                    sortField === "ticker" && "text-foreground"
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    Ticker
                    {sortField === "ticker" && (
                      <ChevronDown className="h-3 w-3" aria-hidden />
                    )}
                  </span>
                </button>
                <div className={cellBase}>Bet</div>
                <button
                  type="button"
                  onClick={() => handleSort("move")}
                  className={cn(
                    cellBase,
                    "hover:text-foreground",
                    sortField === "move" && "text-foreground"
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    Move
                    {sortField === "move" && (
                      <ChevronDown className="h-3 w-3" aria-hidden />
                    )}
                  </span>
                </button>
                <div className={cellBase}>After</div>
                <button
                  type="button"
                  onClick={() => handleSort("delta")}
                  className={cn(
                    cellBase,
                    "hover:text-foreground",
                    sortField === "delta" && "text-foreground"
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    Change
                    {sortField === "delta" && (
                      <ChevronDown className="h-3 w-3" aria-hidden />
                    )}
                  </span>
                </button>
              </FluidRow>
              {sortedRows.map((r) => (
                <FluidRow key={r.ticker}>
                  <div
                    className={cn(
                      tickerCell,
                      "font-semibold tracking-wide text-foreground"
                    )}
                  >
                    <TickerSymbol
                      ticker={r.ticker}
                      showCurrency={mixedListings}
                    />
                  </div>
                  <div className={cn(cellBase, "min-w-0")}>
                    <span className="min-w-0 truncate text-muted-foreground">
                      {r.label}
                    </span>
                  </div>
                  <div
                    className={cn(
                      cellBase,
                      "font-medium tabular-nums",
                      r.movePct === 0
                        ? "text-muted-foreground"
                        : r.movePct > 0
                          ? "text-gain"
                          : "text-loss"
                    )}
                  >
                    {r.movePct > 0 ? "+" : ""}
                    {percent(r.movePct)}
                  </div>
                  <div className={cn(cellBase, "tabular-nums text-foreground/80")}>
                    {currency(r.shockVal, 0)}
                  </div>
                  <div
                    className={cn(
                      cellBase,
                      "font-semibold tabular-nums",
                      r.deltaVal === 0
                        ? "text-muted-foreground"
                        : r.deltaVal > 0
                          ? "text-gain"
                          : "text-loss"
                    )}
                  >
                    {r.deltaVal > 0 ? "+" : ""}
                    {currency(r.deltaVal, 0)}
                  </div>
                </FluidRow>
              ))}
            </FluidTable>
          )}
        </div>
      </Panel>
    </div>
  );
}
