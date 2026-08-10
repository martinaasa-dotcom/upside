"use client";

import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { allocationBySector, allocationByTicker } from "@/lib/allocation";
import {
  buildEarningsAlerts,
  buildStrikeAlerts,
  type UpsideAlert,
} from "@/lib/alerts";
import {
  SHOCKS,
  getShockProfile,
  shockedPct,
  shockedPrice,
  type ShockId,
} from "@/lib/book-shock";
import {
  addCashflow,
  netCashMoves,
  removeCashflow,
  trailingIncome,
  type CashflowEntry,
} from "@/lib/cashflow";
import {
  correlationGrid,
  correlationMatrix,
} from "@/lib/correlation";
import { currency, percent, cn } from "@/lib/format";
import type { LabBundle } from "@/lib/lab-bundle";
import {
  arenaBuy,
  arenaSell,
  arenaValue,
  defaultArena,
  seedArenaFromLive,
  setArenaCash,
} from "@/lib/paper-arena";
import {
  addJournalEntry,
  removeJournalEntry,
  whatIfHeld,
  type JournalEntry,
} from "@/lib/trade-journal";
import { buildWeeklyRecap } from "@/lib/weekly-recap";
import type { OverviewModel } from "@/lib/overview";
import type { CoveredCallRow, Holding, Portfolio, Quote } from "@/lib/types";
import {
  CalendarDays,
  Copy,
  FlaskConical,
  Swords,
  Target,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Props = {
  overview: OverviewModel;
  portfolios: Portfolio[];
  holdings: Holding[];
  quotes: Record<string, Quote>;
  coveredCallRows: CoveredCallRow[];
  earnings: Array<{ ticker: string; date: string; days: number }>;
  lab: LabBundle;
  onLabChange: (patch: Partial<LabBundle>) => void;
  guest?: boolean;
  dismissedAlertIds?: Set<string>;
  onDismissAlert?: (id: string) => void;
};

type LabGroup = "book" | "income" | "trade" | "digest";
type LabTab =
  | "alloc"
  | "versus"
  | "shock"
  | "corr"
  | "calendar"
  | "cashflow"
  | "arena"
  | "journal"
  | "recap"
  | "alerts";

const GROUPS: { id: LabGroup; label: string }[] = [
  { id: "book", label: "Book" },
  { id: "income", label: "Income" },
  { id: "trade", label: "Trade" },
  { id: "digest", label: "Digest" },
];

const TABS: { id: LabTab; group: LabGroup; label: string }[] = [
  { id: "alloc", group: "book", label: "Allocation" },
  { id: "versus", group: "book", label: "Versus" },
  { id: "shock", group: "book", label: "Shock" },
  { id: "corr", group: "book", label: "Correlation" },
  { id: "calendar", group: "income", label: "CC calendar" },
  { id: "cashflow", group: "income", label: "Cashflow" },
  { id: "arena", group: "trade", label: "Arena" },
  { id: "journal", group: "trade", label: "Journal" },
  { id: "recap", group: "digest", label: "Weekly recap" },
  { id: "alerts", group: "digest", label: "Alerts" },
];

export function LabSheet({
  overview,
  portfolios,
  holdings,
  quotes,
  coveredCallRows,
  earnings,
  lab,
  onLabChange,
  guest,
  dismissedAlertIds,
  onDismissAlert,
}: Props) {
  const [group, setGroup] = useState<LabGroup>("book");
  const [tab, setTab] = useState<LabTab>("alloc");
  const [shock, setShock] = useState<ShockId>("none");
  /** What-if scope: full book or a single sheet */
  const [scopeId, setScopeId] = useState<string>("book");
  const [versusA, setVersusA] = useState(portfolios[0]?.id ?? "");
  const [versusB, setVersusB] = useState(
    portfolios[1]?.id ?? portfolios[0]?.id ?? ""
  );
  const arena = lab.arena;
  const journal = lab.journal;
  const cashflows = lab.cashflows;
  const badges = lab.badges ?? [];
  const [copied, setCopied] = useState(false);
  const [jSide, setJSide] = useState<JournalEntry["side"]>("sell");
  const [jTicker, setJTicker] = useState("");
  const [jNote, setJNote] = useState("");
  const [jShares, setJShares] = useState(0);
  const [jPrice, setJPrice] = useState(0);
  const [cfAmount, setCfAmount] = useState(0);
  const [cfNote, setCfNote] = useState("");
  const [cfTicker, setCfTicker] = useState("");
  const [cloneSheetId, setCloneSheetId] = useState(portfolios[0]?.id ?? "");
  const [aTicker, setATicker] = useState("");
  const [aShares, setAShares] = useState(0);
  const [aPrice, setAPrice] = useState(0);
  const [aCash, setACash] = useState(arena.cash);
  const [arenaMsg, setArenaMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!versusA && portfolios[0]) setVersusA(portfolios[0].id);
    if (!versusB && portfolios[1]) setVersusB(portfolios[1].id);
    if (!cloneSheetId && portfolios[0]) setCloneSheetId(portfolios[0].id);
  }, [portfolios, versusA, versusB, cloneSheetId]);

  useEffect(() => {
    setACash(arena.cash);
  }, [arena.cash, arena.updatedAt]);

  const groupTabs = TABS.filter((t) => t.group === group);

  function selectGroup(g: LabGroup) {
    setGroup(g);
    const first = TABS.find((t) => t.group === g);
    if (first) setTab(first.id);
  }

  function selectTab(id: LabTab) {
    const meta = TABS.find((t) => t.id === id);
    if (meta) setGroup(meta.group);
    setTab(id);
  }

  const scopedTickers = useMemo(() => {
    if (scopeId === "book") return overview.tickers;
    const rows = holdings.filter((h) => h.portfolio_id === scopeId);
    const byTicker = new Map<
      string,
      { ticker: string; shares: number; buyValue: number; sparkline: number[] }
    >();
    for (const h of rows) {
      const prev = byTicker.get(h.ticker) ?? {
        ticker: h.ticker,
        shares: 0,
        buyValue: 0,
        sparkline: [],
      };
      prev.shares += h.shares;
      prev.buyValue += h.shares * h.buy_price;
      const spark = quotes[h.ticker]?.sparkline ?? [];
      if (spark.length > prev.sparkline.length) prev.sparkline = spark;
      byTicker.set(h.ticker, prev);
    }
    return [...byTicker.values()].map((t) => {
      const price = quotes[t.ticker]?.price ?? t.buyValue / Math.max(t.shares, 1);
      const currentValue = t.shares * price;
      return {
        ticker: t.ticker,
        shares: t.shares,
        price,
        currentValue,
        buyValue: t.buyValue,
        sparkline: t.sparkline,
        portfolios: [],
        portfolioIds: [scopeId],
        roiDollar: currentValue - t.buyValue,
        roiPct: t.buyValue > 0 ? (currentValue - t.buyValue) / t.buyValue : 0,
        todayDollar: 0,
        todayPct: quotes[t.ticker]?.changePercent ?? null,
      };
    });
  }, [scopeId, overview.tickers, holdings, quotes]);

  const scopedCash = useMemo(() => {
    if (scopeId === "book") return overview.totals.cash;
    return (
      portfolios.find((p) => p.id === scopeId)?.cash_balance ?? 0
    );
  }, [scopeId, overview.totals.cash, portfolios]);

  const scopeLabel =
    scopeId === "book"
      ? "Entire book"
      : (portfolios.find((p) => p.id === scopeId)?.name ?? "Sheet");

  const scopeApplies =
    tab === "alloc" ||
    tab === "shock" ||
    tab === "corr" ||
    tab === "calendar";

  const sheetHoldings = useMemo(
    () =>
      scopedTickers.map((t) => ({
        ticker: t.ticker,
        currentValue: t.currentValue,
      })),
    [scopedTickers]
  );

  const sectors = useMemo(
    () => allocationBySector(sheetHoldings),
    [sheetHoldings]
  );
  const byTicker = useMemo(
    () => allocationByTicker(sheetHoldings),
    [sheetHoldings]
  );

  const alerts: UpsideAlert[] = useMemo(() => {
    const strike = buildStrikeAlerts(
      coveredCallRows.map((r) => ({
        ticker: r.holding.ticker,
        spot: r.spot,
        stockTarget: r.stockTarget,
        nextStrike: r.nextStrike,
      }))
    );
    const all = [...buildEarningsAlerts(earnings), ...strike];
    if (!dismissedAlertIds?.size) return all;
    return all.filter((a) => !dismissedAlertIds.has(a.id));
  }, [coveredCallRows, earnings, dismissedAlertIds]);

  const corrSeries = useMemo(
    () =>
      scopedTickers
        .filter((t) => (t.sparkline?.length ?? 0) > 5)
        .slice(0, 8)
        .map((t) => ({ ticker: t.ticker, sparkline: t.sparkline ?? [] })),
    [scopedTickers]
  );
  const corrPairs = useMemo(
    () => correlationMatrix(corrSeries).slice(0, 10),
    [corrSeries]
  );
  const corrHeat = useMemo(() => correlationGrid(corrSeries), [corrSeries]);

  const shockRows = useMemo(() => {
    return scopedTickers
      .map((t) => {
        const livePx = t.price;
        const shockPx = shockedPrice(t.ticker, livePx, shock);
        const liveVal = t.currentValue;
        const shockVal = t.shares * shockPx;
        const profile = getShockProfile(t.ticker);
        return {
          ticker: t.ticker,
          label: profile.label,
          shares: t.shares,
          livePx,
          shockPx,
          liveVal,
          shockVal,
          delta: shockVal - liveVal,
          deltaPct: liveVal > 0 ? (shockVal - liveVal) / liveVal : 0,
          movePct: shockedPct(t.ticker, shock),
        };
      })
      .sort((a, b) => a.delta - b.delta);
  }, [scopedTickers, shock]);

  const shockTotals = useMemo(() => {
    const liveEquity = shockRows.reduce((s, r) => s + r.liveVal, 0);
    const shockEquity = shockRows.reduce((s, r) => s + r.shockVal, 0);
    const live = liveEquity + scopedCash;
    const shocked = shockEquity + scopedCash;
    return { live, shocked, delta: shocked - live };
  }, [shockRows, scopedCash]);

  const scopedCcRows = useMemo(() => {
    if (scopeId === "book") return coveredCallRows;
    return coveredCallRows.filter((r) => r.holding.portfolio_id === scopeId);
  }, [coveredCallRows, scopeId]);

  const recap = useMemo(() => buildWeeklyRecap(overview), [overview]);

  const ccByExpiry = useMemo(() => {
    const map = new Map<string, CoveredCallRow[]>();
    for (const r of scopedCcRows) {
      const exp = r.expiration ?? "—";
      const list = map.get(exp) ?? [];
      list.push(r);
      map.set(exp, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [scopedCcRows]);

  function sheetStats(id: string) {
    const sheet = overview.sheets.find((s) => s.portfolio.id === id);
    if (!sheet) return null;
    return {
      name: sheet.portfolio.name,
      value: sheet.totalValue,
      roi: sheet.roiPct,
      cash: sheet.portfolio.cash_balance,
      holdings: sheet.holdingCount,
      today: sheet.todayDollar,
      todayPct: sheet.todayPct,
    };
  }

  const aStats = sheetStats(versusA);
  const bStats = sheetStats(versusB);

  const prices: Record<string, number> = {};
  for (const [k, q] of Object.entries(quotes)) prices[k] = q.price;
  const arenaLive = arenaValue(arena, prices);
  const arenaCost = arena.holdings.reduce(
    (s, h) => s + h.shares * h.buyPrice,
    0
  );
  const arenaPnl = arenaLive - arena.cash - arenaCost;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-white">Lab</h2>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Sandbox tools for the book — allocation, shocks, paper trading,
          income log, and digests. Edits sync when the book is unlocked.
        </p>
        <div className="mt-3 flex h-8 min-h-8 items-center gap-2 overflow-hidden">
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Scope
          </span>
          <select
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            disabled={!scopeApplies}
            className={cn(
              "shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-white",
              !scopeApplies && "cursor-not-allowed opacity-40"
            )}
          >
            <option value="book">Entire book</option>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="min-w-0 truncate text-[11px] text-zinc-600">
            {scopeApplies
              ? `What-ifs run on ${scopeLabel}`
              : "Scope unused on this tool"}
          </span>
        </div>
        <div className="mt-3 flex min-h-[2.25rem] flex-wrap gap-1 border-b border-zinc-800 pb-2">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => selectGroup(g.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                group === g.id
                  ? "bg-zinc-100 text-[#121214]"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex min-h-[2rem] flex-wrap gap-1">
          {groupTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                tab === t.id
                  ? "bg-brand/20 text-brand-bright ring-1 ring-inset ring-brand/40"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "alloc" && (
        <div className="grid gap-4 md:grid-cols-2">
          <AllocCard title="By sector" slices={sectors} />
          <AllocCard title="By ticker" slices={byTicker} />
        </div>
      )}

      {tab === "versus" && (
        <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Swords className="h-4 w-4 text-brand" /> Sheet versus
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              value={versusA}
              onChange={(e) => setVersusA(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            >
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={versusB}
              onChange={(e) => setVersusB(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            >
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {aStats && bStats && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <VersusCard stats={aStats} />
              <VersusCard stats={bStats} />
              <div className="col-span-2 grid gap-2 rounded-lg border border-zinc-800 px-3 py-3 text-sm text-zinc-400 sm:grid-cols-3">
                <p>
                  Value{" "}
                  <span
                    className={
                      aStats.value - bStats.value >= 0
                        ? "text-gain"
                        : "text-loss"
                    }
                  >
                    {currency(aStats.value - bStats.value)}
                  </span>
                </p>
                <p>
                  ROI{" "}
                  <span
                    className={
                      aStats.roi - bStats.roi >= 0 ? "text-gain" : "text-loss"
                    }
                  >
                    {percent(aStats.roi - bStats.roi)}
                  </span>
                </p>
                <p>
                  Today{" "}
                  <span
                    className={
                      aStats.today - bStats.today >= 0
                        ? "text-gain"
                        : "text-loss"
                    }
                  >
                    {currency(aStats.today - bStats.today)}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "arena" && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-zinc-300">
                Paper Arena ·{" "}
                <span className="font-semibold text-white">
                  {currency(arenaLive)}
                </span>
                <span className="text-zinc-500">
                  {" "}
                  · cash {currency(arena.cash)}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">{arena.note}</p>
              <p
                className={cn(
                  "mt-1 text-xs tabular-nums",
                  arenaPnl >= 0 ? "text-gain" : "text-loss"
                )}
              >
                Unrealized vs cost {currency(arenaPnl)}
              </p>
            </div>
          </div>

          {!guest && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={cloneSheetId}
                  onChange={(e) => setCloneSheetId(e.target.value)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white"
                >
                  {portfolios.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"
                  onClick={() => {
                    const sheet = overview.sheets.find(
                      (s) => s.portfolio.id === cloneSheetId
                    );
                    if (!sheet) return;
                    const hs = holdings.filter(
                      (h) => h.portfolio_id === sheet.portfolio.id
                    );
                    onLabChange({
                      arena: seedArenaFromLive(
                        sheet.portfolio.cash_balance,
                        hs,
                        sheet.portfolio.name
                      ),
                    });
                    setArenaMsg(`Cloned ${sheet.portfolio.name}`);
                  }}
                >
                  Clone sheet
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"
                  onClick={() => {
                    onLabChange({ arena: defaultArena() });
                    setArenaMsg("Sandbox reset");
                  }}
                >
                  Reset
                </button>
              </div>

              <div className="grid gap-2 rounded-lg border border-zinc-800 p-3 sm:grid-cols-5">
                <input
                  value={aTicker}
                  onChange={(e) => {
                    setATicker(e.target.value.toUpperCase());
                    const q = quotes[e.target.value.toUpperCase()]?.price;
                    if (q) setAPrice(q);
                  }}
                  placeholder="Ticker"
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white"
                />
                <FormattedNumberInput
                  kind="money"
                  currency="USD"
                  digits={0}
                  value={aShares}
                  onChange={setAShares}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white"
                />
                <FormattedNumberInput
                  kind="money"
                  currency="USD"
                  digits={2}
                  value={aPrice}
                  onChange={setAPrice}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white"
                />
                <button
                  type="button"
                  className="rounded-lg bg-brand/20 text-xs font-medium text-brand-bright"
                  onClick={() => {
                    const next = arenaBuy(arena, aTicker, aShares, aPrice);
                    if (!next) {
                      setArenaMsg("Buy failed — check cash / inputs");
                      return;
                    }
                    onLabChange({ arena: next });
                    setArenaMsg(`Bought ${aShares} ${aTicker}`);
                    setAShares(0);
                  }}
                >
                  Buy
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-zinc-700 text-xs text-zinc-300"
                  onClick={() => {
                    const next = arenaSell(arena, aTicker, aShares, aPrice);
                    if (!next) {
                      setArenaMsg("Sell failed — check shares / inputs");
                      return;
                    }
                    onLabChange({ arena: next });
                    setArenaMsg(`Sold ${aShares} ${aTicker}`);
                    setAShares(0);
                  }}
                >
                  Sell
                </button>
                <div className="flex gap-2 sm:col-span-5">
                  <FormattedNumberInput
                    kind="money"
                    currency="USD"
                    digits={0}
                    value={aCash}
                    onChange={setACash}
                    className="w-40 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white"
                  />
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
                    onClick={() => {
                      onLabChange({ arena: setArenaCash(arena, aCash) });
                      setArenaMsg("Cash updated");
                    }}
                  >
                    Set cash
                  </button>
                  {arenaMsg && (
                    <p className="self-center text-xs text-zinc-500">
                      {arenaMsg}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          <ul className="space-y-1 text-sm">
            {arena.holdings.map((h) => {
              const mark = prices[h.ticker] ?? h.buyPrice;
              const pnl = h.shares * (mark - h.buyPrice);
              return (
                <li
                  key={h.ticker}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800/80 px-3 py-2 text-zinc-300"
                >
                  <span>
                    <button
                      type="button"
                      className="font-medium text-white hover:text-brand-bright"
                      onClick={() => {
                        setATicker(h.ticker);
                        setAPrice(mark);
                        setAShares(h.shares);
                      }}
                    >
                      {h.ticker}
                    </button>{" "}
                    · {h.shares} @ {currency(h.buyPrice)}
                  </span>
                  <span className="tabular-nums">
                    {currency(h.shares * mark)}{" "}
                    <span
                      className={cn(
                        "text-xs",
                        pnl >= 0 ? "text-gain" : "text-loss"
                      )}
                    >
                      ({currency(pnl)})
                    </span>
                  </span>
                </li>
              );
            })}
            {arena.holdings.length === 0 && (
              <li className="text-zinc-500">
                Empty — clone a sheet or buy a ticker.
              </li>
            )}
          </ul>
        </div>
      )}

      {tab === "shock" && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white">Shock lab</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {SHOCKS.find((s) => s.id === shock)?.tagline} · {scopeLabel}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SHOCKS.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.tagline}
                onClick={() => setShock(s.id)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium",
                  shock === s.id
                    ? "bg-brand/20 text-brand-bright ring-1 ring-brand/40"
                    : "text-zinc-400 hover:bg-zinc-800"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-zinc-500">Live</p>
              <p className="tabular-nums text-white">
                {currency(shockTotals.live)}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Shocked</p>
              <p className="tabular-nums text-white">
                {currency(shockTotals.shocked)}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Delta</p>
              <p
                className={cn(
                  "tabular-nums font-medium",
                  shockTotals.delta >= 0 ? "text-gain" : "text-loss"
                )}
              >
                {currency(shockTotals.delta)}
              </p>
            </div>
          </div>
          {shock !== "none" && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-xs">
                <thead className="text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="py-1.5 pr-2 font-medium">Ticker</th>
                    <th className="py-1.5 pr-2 font-medium">Theme</th>
                    <th className="py-1.5 pr-2 font-medium">Move</th>
                    <th className="py-1.5 pr-2 font-medium">Live</th>
                    <th className="py-1.5 pr-2 font-medium">Shock</th>
                    <th className="py-1.5 font-medium">Δ value</th>
                  </tr>
                </thead>
                <tbody>
                  {shockRows.map((r) => (
                    <tr key={r.ticker} className="border-b border-zinc-900">
                      <td className="py-1.5 pr-2 font-medium text-white">
                        {r.ticker}
                      </td>
                      <td className="max-w-[10rem] truncate py-1.5 pr-2 text-zinc-500">
                        {r.label}
                      </td>
                      <td
                        className={cn(
                          "py-1.5 pr-2 tabular-nums",
                          r.movePct === 0
                            ? "text-zinc-500"
                            : r.movePct > 0
                              ? "text-gain"
                              : "text-loss"
                        )}
                      >
                        {percent(r.movePct)}
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums text-zinc-400">
                        {currency(r.liveVal, 0)}
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums text-zinc-300">
                        {currency(r.shockVal, 0)}
                      </td>
                      <td
                        className={cn(
                          "py-1.5 tabular-nums",
                          r.delta === 0
                            ? "text-zinc-500"
                            : r.delta > 0
                              ? "text-gain"
                              : "text-loss"
                        )}
                      >
                        {currency(r.delta, 0)}
                      </td>
                    </tr>
                  ))}
                  {shockRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-3 text-zinc-500">
                        No holdings in this scope.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "calendar" && (
        <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <CalendarDays className="h-4 w-4 text-brand" /> CC income calendar
          </div>
          {ccByExpiry.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No expiries on covered-call rows yet — set strikes on a sheet.
            </p>
          ) : (
            <div className="space-y-3">
              {ccByExpiry.map(([exp, rows]) => {
                const prem = rows.reduce((s, r) => s + (r.premium ?? 0), 0);
                return (
                  <div
                    key={exp}
                    className="rounded-lg border border-zinc-800 px-3 py-2"
                  >
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-white">{exp}</span>
                      <span className="tabular-nums text-brand-bright">
                        ~{currency(prem)} prem
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-zinc-500">
                      {rows.map((r) => (
                        <li
                          key={r.holding.id}
                          className="flex justify-between gap-2"
                        >
                          <span>
                            {r.holding.ticker}
                            {r.nextStrike != null
                              ? ` · strike ${currency(r.nextStrike)}`
                              : ""}
                          </span>
                          <span className="tabular-nums">
                            {r.premium != null ? currency(r.premium) : "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "journal" && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
          {!guest && (
            <div className="grid gap-2 sm:grid-cols-5">
              <select
                value={jSide}
                onChange={(e) =>
                  setJSide(e.target.value as JournalEntry["side"])
                }
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
                <option value="trim">Trim</option>
                <option value="note">Note</option>
              </select>
              <input
                value={jTicker}
                onChange={(e) => setJTicker(e.target.value.toUpperCase())}
                placeholder="Ticker"
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white"
              />
              <FormattedNumberInput
                kind="money"
                currency="USD"
                digits={0}
                value={jShares}
                onChange={setJShares}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white"
              />
              <FormattedNumberInput
                kind="money"
                currency="USD"
                digits={2}
                value={jPrice}
                onChange={setJPrice}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white"
              />
              <button
                type="button"
                className="rounded-lg bg-brand/20 text-xs font-medium text-brand-bright"
                onClick={() => {
                  if (!jTicker) return;
                  if (jSide !== "note" && (!(jShares > 0) || !(jPrice > 0)))
                    return;
                  onLabChange({
                    journal: addJournalEntry(journal, {
                      ticker: jTicker,
                      side: jSide,
                      shares: jSide === "note" ? 0 : jShares,
                      price: jSide === "note" ? 0 : jPrice,
                      note: jNote || `${jSide} logged`,
                    }),
                  });
                  setJNote("");
                }}
              >
                Log entry
              </button>
              <input
                value={jNote}
                onChange={(e) => setJNote(e.target.value)}
                placeholder="Note / thesis"
                className="sm:col-span-5 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white"
              />
            </div>
          )}
          <ul className="space-y-2">
            {journal.slice(0, 40).map((e) => {
              const now = quotes[e.ticker]?.price;
              const what =
                now != null && (e.side === "sell" || e.side === "trim")
                  ? whatIfHeld({
                      shares: e.shares,
                      exitPrice: e.price,
                      nowPrice: now,
                    })
                  : null;
              return (
                <li
                  key={e.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-300"
                >
                  <div>
                    <span className="font-medium text-white">
                      {e.side.toUpperCase()} {e.ticker}
                    </span>
                    {e.side !== "note" && (
                      <>
                        {" "}
                        {e.shares} @ {currency(e.price)}
                      </>
                    )}
                    {what && (
                      <span
                        className={cn(
                          "ml-2 text-xs",
                          what.missedDollar >= 0 ? "text-gain" : "text-loss"
                        )}
                      >
                        what-if held: {currency(what.missedDollar)} (
                        {percent(what.missedPct)})
                      </span>
                    )}
                    {e.note && (
                      <p className="mt-0.5 text-xs text-zinc-500">{e.note}</p>
                    )}
                    <p className="text-[10px] text-zinc-600">
                      {new Date(e.at).toLocaleString()}
                    </p>
                  </div>
                  {!guest && (
                    <button
                      type="button"
                      aria-label="Delete entry"
                      className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-rose-300"
                      onClick={() =>
                        onLabChange({
                          journal: removeJournalEntry(journal, e.id),
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
            {journal.length === 0 && (
              <li className="text-zinc-500">No journal entries yet.</li>
            )}
          </ul>
        </div>
      )}

      {tab === "cashflow" && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p className="text-zinc-300">
              Trailing 12m income (div + premium):{" "}
              <span className="font-semibold text-white">
                {currency(trailingIncome(cashflows))}
              </span>
            </p>
            <p className="text-zinc-300">
              Net cash moves (12m):{" "}
              <span className="font-semibold text-white">
                {currency(netCashMoves(cashflows))}
              </span>
            </p>
          </div>
          {!guest && (
            <div className="flex flex-wrap gap-2">
              <FormattedNumberInput
                kind="money"
                currency="USD"
                digits={2}
                value={cfAmount}
                onChange={setCfAmount}
                className="w-36 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white"
              />
              <input
                value={cfTicker}
                onChange={(e) => setCfTicker(e.target.value.toUpperCase())}
                placeholder="Ticker (opt)"
                className="w-28 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white"
              />
              <input
                value={cfNote}
                onChange={(e) => setCfNote(e.target.value)}
                placeholder="Note"
                className="min-w-[8rem] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white"
              />
              {(
                [
                  ["premium", "Premium"],
                  ["dividend", "Dividend"],
                  ["deposit", "Deposit"],
                  ["withdrawal", "Withdrawal"],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
                  onClick={() => {
                    if (!(cfAmount > 0)) return;
                    onLabChange({
                      cashflows: addCashflow(cashflows, {
                        kind,
                        amount: cfAmount,
                        ticker: cfTicker || undefined,
                        note: cfNote || label,
                      }),
                    });
                    setCfAmount(0);
                    setCfNote("");
                  }}
                >
                  + {label}
                </button>
              ))}
            </div>
          )}
          <ul className="space-y-1 text-sm text-zinc-400">
            {cashflows.slice(0, 30).map((e: CashflowEntry) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 border-b border-zinc-900 py-1"
              >
                <span>
                  {e.kind}
                  {e.ticker ? ` · ${e.ticker}` : ""} · {e.note}
                  <span className="ml-2 text-[10px] text-zinc-600">
                    {new Date(e.at).toLocaleDateString()}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums text-zinc-200">
                    {currency(e.amount)}
                  </span>
                  {!guest && (
                    <button
                      type="button"
                      aria-label="Delete cashflow"
                      className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-rose-300"
                      onClick={() =>
                        onLabChange({
                          cashflows: removeCashflow(cashflows, e.id),
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </li>
            ))}
            {cashflows.length === 0 && (
              <li className="text-zinc-500">No cashflows logged yet.</li>
            )}
          </ul>
        </div>
      )}

      {tab === "corr" && (
        <div className="space-y-4 rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
          <p className="text-sm font-semibold text-white">
            Correlations (90d sparkline)
          </p>
          {corrHeat.tickers.length < 2 ? (
            <p className="text-sm text-zinc-500">
              Need at least two names with price history.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="border-collapse text-[10px]">
                  <thead>
                    <tr>
                      <th className="p-1" />
                      {corrHeat.tickers.map((t) => (
                        <th
                          key={t}
                          className="p-1 font-medium text-zinc-500"
                        >
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {corrHeat.tickers.map((row, i) => (
                      <tr key={row}>
                        <td className="p-1 font-medium text-zinc-400">{row}</td>
                        {corrHeat.grid[i]!.map((c, j) => (
                          <td
                            key={`${row}-${j}`}
                            title={
                              c == null
                                ? "—"
                                : `${row} ↔ ${corrHeat.tickers[j]}: ${c.toFixed(2)}`
                            }
                            className="p-0.5"
                          >
                            <div
                              className="flex h-7 w-7 items-center justify-center rounded tabular-nums text-[9px] text-zinc-100"
                              style={{
                                background:
                                  c == null
                                    ? "#27272a"
                                    : c >= 0
                                      ? `rgba(212, 160, 64, ${0.15 + Math.abs(c) * 0.7})`
                                      : `rgba(56, 189, 248, ${0.15 + Math.abs(c) * 0.7})`,
                              }}
                            >
                              {c == null ? "—" : c.toFixed(1)}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-1.5 text-sm">
                {corrPairs.map((c) => (
                  <li
                    key={`${c.a}-${c.b}`}
                    className="flex justify-between rounded-lg border border-zinc-800/80 px-3 py-2"
                  >
                    <span className="text-zinc-300">
                      {c.a} ↔ {c.b}
                    </span>
                    <span
                      className={cn(
                        "tabular-nums font-medium",
                        c.corr >= 0.7
                          ? "text-amber-300"
                          : c.corr <= -0.3
                            ? "text-sky-300"
                            : "text-zinc-400"
                      )}
                    >
                      {c.corr.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {tab === "recap" && (
        <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">Weekly postcard</p>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300"
              onClick={async () => {
                await navigator.clipboard.writeText(recap);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Copy className="h-3 w-3" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="whitespace-pre-wrap rounded-lg bg-zinc-950/80 px-3 py-3 text-sm leading-relaxed text-zinc-300">
            {recap}
          </pre>
          {badges.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Season badges
              </p>
              <ul className="flex flex-wrap gap-2">
                {badges.map((b) => (
                  <li
                    key={b.id}
                    className="rounded-lg border border-brand/30 bg-brand/10 px-2.5 py-1 text-xs text-brand-bright"
                    title={b.earnedAt}
                  >
                    {b.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === "alerts" && (
        <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Target className="h-4 w-4 text-brand" /> Live alerts
          </div>
          {alerts.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Quiet — no earnings ≤7d or strikes under pressure
              {dismissedAlertIds?.size ? " (some dismissed)" : ""}.
            </p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-amber-100">
                      {a.title}
                    </p>
                    <p className="text-xs text-amber-200/70">{a.detail}</p>
                  </div>
                  {onDismissAlert && !guest && (
                    <button
                      type="button"
                      className="shrink-0 rounded px-2 py-1 text-[10px] text-amber-200/60 hover:bg-amber-900/40 hover:text-amber-100"
                      onClick={() => onDismissAlert(a.id)}
                    >
                      Dismiss
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AllocCard({
  title,
  slices,
}: {
  title: string;
  slices: { label: string; pct: number; value: number }[];
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
      <p className="mb-3 text-sm font-semibold text-white">{title}</p>
      <div className="space-y-2">
        {slices.map((s) => (
          <div key={s.label}>
            <div className="mb-0.5 flex justify-between text-xs text-zinc-400">
              <span>{s.label}</span>
              <span className="tabular-nums">
                {(s.pct * 100).toFixed(1)}% · {currency(s.value, 0)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-900">
              <div
                className="h-full rounded-full bg-brand/70"
                style={{ width: `${Math.min(100, s.pct * 100)}%` }}
              />
            </div>
          </div>
        ))}
        {slices.length === 0 && (
          <p className="text-sm text-zinc-500">No equity to allocate.</p>
        )}
      </div>
    </div>
  );
}

function VersusCard({
  stats,
}: {
  stats: {
    name: string;
    value: number;
    roi: number;
    cash: number;
    holdings: number;
    today: number;
    todayPct: number | null;
  };
}) {
  return (
    <div className="rounded-lg border border-zinc-800 px-3 py-3">
      <p className="font-semibold text-white">{stats.name}</p>
      <p className="mt-1 text-lg tabular-nums text-zinc-100">
        {currency(stats.value)}
      </p>
      <p
        className={cn(
          "text-sm tabular-nums",
          stats.roi >= 0 ? "text-gain" : "text-loss"
        )}
      >
        {percent(stats.roi)} ROI
      </p>
      <p
        className={cn(
          "text-xs tabular-nums",
          stats.today >= 0 ? "text-gain" : "text-loss"
        )}
      >
        Today {currency(stats.today)}
        {stats.todayPct != null ? ` (${percent(stats.todayPct)})` : ""}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Cash {currency(stats.cash)} · {stats.holdings} holdings
      </p>
    </div>
  );
}
