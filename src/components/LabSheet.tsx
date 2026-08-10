"use client";

import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { allocationBySector, allocationByTicker } from "@/lib/allocation";
import {
  buildEarningsAlerts,
  buildStrikeAlerts,
  type UpsideAlert,
} from "@/lib/alerts";
import { SHOCKS, shockedPrice, type ShockId } from "@/lib/book-shock";
import {
  addCashflow,
  loadCashflows,
  trailingIncome,
  type CashflowEntry,
} from "@/lib/cashflow";
import { correlationMatrix } from "@/lib/correlation";
import { currency, percent, cn } from "@/lib/format";
import {
  arenaValue,
  defaultArena,
  loadArena,
  saveArena,
  seedArenaFromLive,
  type ArenaState,
} from "@/lib/paper-arena";
import {
  addJournalEntry,
  loadJournal,
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
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Props = {
  overview: OverviewModel;
  portfolios: Portfolio[];
  holdings: Holding[];
  quotes: Record<string, Quote>;
  coveredCallRows: CoveredCallRow[];
  earnings: Array<{ ticker: string; date: string; days: number }>;
  guest?: boolean;
};

type LabTab =
  | "alloc"
  | "versus"
  | "arena"
  | "shock"
  | "calendar"
  | "journal"
  | "cashflow"
  | "corr"
  | "recap"
  | "alerts";

const TABS: { id: LabTab; label: string }[] = [
  { id: "alloc", label: "Allocation" },
  { id: "versus", label: "Versus" },
  { id: "arena", label: "Arena" },
  { id: "shock", label: "Shock lab" },
  { id: "calendar", label: "CC calendar" },
  { id: "journal", label: "Journal" },
  { id: "cashflow", label: "Cashflow" },
  { id: "corr", label: "Correlation" },
  { id: "recap", label: "Weekly recap" },
  { id: "alerts", label: "Alerts" },
];

export function LabSheet({
  overview,
  portfolios,
  holdings,
  quotes,
  coveredCallRows,
  earnings,
  guest,
}: Props) {
  const [tab, setTab] = useState<LabTab>("alloc");
  const [shock, setShock] = useState<ShockId>("none");
  const [versusA, setVersusA] = useState(portfolios[0]?.id ?? "");
  const [versusB, setVersusB] = useState(portfolios[1]?.id ?? portfolios[0]?.id ?? "");
  const [arena, setArena] = useState<ArenaState>(defaultArena);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [cashflows, setCashflows] = useState<CashflowEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [jTicker, setJTicker] = useState("");
  const [jNote, setJNote] = useState("");
  const [jShares, setJShares] = useState(0);
  const [jPrice, setJPrice] = useState(0);
  const [cfAmount, setCfAmount] = useState(0);
  const [cfNote, setCfNote] = useState("");

  useEffect(() => {
    setArena(loadArena());
    setJournal(loadJournal());
    setCashflows(loadCashflows());
  }, []);

  useEffect(() => {
    if (!versusA && portfolios[0]) setVersusA(portfolios[0].id);
    if (!versusB && portfolios[1]) setVersusB(portfolios[1].id);
  }, [portfolios, versusA, versusB]);

  const sheetHoldings = useMemo(
    () =>
      overview.tickers.map((t) => ({
        ticker: t.ticker,
        currentValue: t.currentValue,
      })),
    [overview.tickers]
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
    return [...buildEarningsAlerts(earnings), ...strike];
  }, [coveredCallRows, earnings]);

  const corr = useMemo(() => {
    const series = overview.tickers
      .filter((t) => (t.sparkline?.length ?? 0) > 5)
      .slice(0, 10)
      .map((t) => ({ ticker: t.ticker, sparkline: t.sparkline ?? [] }));
    return correlationMatrix(series).slice(0, 12);
  }, [overview.tickers]);

  const shockTotals = useMemo(() => {
    let live = 0;
    let shocked = 0;
    for (const t of overview.tickers) {
      live += t.currentValue;
      const px = shockedPrice(t.ticker, t.price, shock);
      shocked += t.shares * px;
    }
    live += overview.totals.cash;
    shocked += overview.totals.cash;
    return { live, shocked, delta: shocked - live };
  }, [overview, shock]);

  const recap = useMemo(() => buildWeeklyRecap(overview), [overview]);

  const ccByExpiry = useMemo(() => {
    const map = new Map<string, CoveredCallRow[]>();
    for (const r of coveredCallRows) {
      const exp = r.expiration ?? "—";
      const list = map.get(exp) ?? [];
      list.push(r);
      map.set(exp, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [coveredCallRows]);

  function sheetStats(id: string) {
    const sheet = overview.sheets.find((s) => s.portfolio.id === id);
    if (!sheet) return null;
    return {
      name: sheet.portfolio.name,
      value: sheet.totalValue,
      roi: sheet.roiPct,
      cash: sheet.portfolio.cash_balance,
    };
  }

  const aStats = sheetStats(versusA);
  const bStats = sheetStats(versusB);

  const prices: Record<string, number> = {};
  for (const [k, q] of Object.entries(quotes)) prices[k] = q.price;
  const arenaLive = arenaValue(arena, prices);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-white">Lab</h2>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Play layer from the product audit — allocation, versus, paper arena,
          shocks, CC calendar, journal, cashflow, correlation, weekly recap,
          alerts.
        </p>
        <div className="mt-3 flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
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
              <p className="col-span-2 text-center text-sm text-zinc-400">
                Value delta{" "}
                <span
                  className={
                    aStats.value - bStats.value >= 0 ? "text-gain" : "text-loss"
                  }
                >
                  {currency(aStats.value - bStats.value)}
                </span>
                {" · "}
                ROI gap{" "}
                <span
                  className={
                    aStats.roi - bStats.roi >= 0 ? "text-gain" : "text-loss"
                  }
                >
                  {percent(aStats.roi - bStats.roi)}
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      {tab === "arena" && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
          <p className="text-sm text-zinc-300">
            Paper Arena · value {currency(arenaLive)} · cash{" "}
            {currency(arena.cash)}
          </p>
          <p className="text-xs text-zinc-500">{arena.note}</p>
          {!guest && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"
                onClick={() => {
                  const sheet = overview.sheets[0];
                  if (!sheet) return;
                  const hs = holdings.filter(
                    (h) => h.portfolio_id === sheet.portfolio.id
                  );
                  const next = seedArenaFromLive(
                    sheet.portfolio.cash_balance,
                    hs
                  );
                  setArena(next);
                }}
              >
                Clone first sheet
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"
                onClick={() => {
                  const next = defaultArena();
                  saveArena(next);
                  setArena(next);
                }}
              >
                Reset sandbox
              </button>
            </div>
          )}
          <ul className="space-y-1 text-sm">
            {arena.holdings.map((h) => (
              <li
                key={h.ticker}
                className="flex justify-between rounded-lg border border-zinc-800/80 px-3 py-2 text-zinc-300"
              >
                <span>
                  {h.ticker} · {h.shares} @ {currency(h.buyPrice)}
                </span>
                <span className="tabular-nums">
                  {currency(h.shares * (prices[h.ticker] ?? h.buyPrice))}
                </span>
              </li>
            ))}
            {arena.holdings.length === 0 && (
              <li className="text-zinc-500">Empty — clone a live sheet.</li>
            )}
          </ul>
        </div>
      )}

      {tab === "shock" && (
        <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
          <p className="mb-3 text-sm font-semibold text-white">
            Book-wide shock lab
          </p>
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
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
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
        </div>
      )}

      {tab === "calendar" && (
        <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <CalendarDays className="h-4 w-4 text-brand" /> CC income calendar
          </div>
          {ccByExpiry.length === 0 ? (
            <p className="text-sm text-zinc-500">No expiries on active rows.</p>
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
                    <p className="mt-1 text-xs text-zinc-500">
                      {rows.map((r) => r.holding.ticker).join(" · ")}
                    </p>
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
            <div className="grid gap-2 sm:grid-cols-4">
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
                  if (!jTicker || !(jShares > 0) || !(jPrice > 0)) return;
                  const next = addJournalEntry(journal, {
                    ticker: jTicker,
                    side: "sell",
                    shares: jShares,
                    price: jPrice,
                    note: jNote || "Logged sell",
                  });
                  setJournal(next);
                  setJNote("");
                }}
              >
                Log sell
              </button>
              <input
                value={jNote}
                onChange={(e) => setJNote(e.target.value)}
                placeholder="Note / thesis"
                className="sm:col-span-4 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white"
              />
            </div>
          )}
          <ul className="space-y-2">
            {journal.slice(0, 20).map((e) => {
              const now = quotes[e.ticker]?.price;
              const what =
                now != null && e.side === "sell"
                  ? whatIfHeld({
                      shares: e.shares,
                      exitPrice: e.price,
                      nowPrice: now,
                    })
                  : null;
              return (
                <li
                  key={e.id}
                  className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-300"
                >
                  <span className="font-medium text-white">
                    {e.side.toUpperCase()} {e.ticker}
                  </span>{" "}
                  {e.shares} @ {currency(e.price)}
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
          <p className="text-sm text-zinc-300">
            Trailing 12m income (div + premium):{" "}
            <span className="font-semibold text-white">
              {currency(trailingIncome(cashflows))}
            </span>
          </p>
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
                value={cfNote}
                onChange={(e) => setCfNote(e.target.value)}
                placeholder="Note"
                className="min-w-[8rem] flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white"
              />
              <button
                type="button"
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
                onClick={() => {
                  if (!(cfAmount > 0)) return;
                  setCashflows(
                    addCashflow(cashflows, {
                      kind: "premium",
                      amount: cfAmount,
                      note: cfNote || "CC premium",
                    })
                  );
                  setCfAmount(0);
                  setCfNote("");
                }}
              >
                + Premium
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
                onClick={() => {
                  if (!(cfAmount > 0)) return;
                  setCashflows(
                    addCashflow(cashflows, {
                      kind: "dividend",
                      amount: cfAmount,
                      note: cfNote || "Dividend",
                    })
                  );
                  setCfAmount(0);
                  setCfNote("");
                }}
              >
                + Dividend
              </button>
            </div>
          )}
          <ul className="space-y-1 text-sm text-zinc-400">
            {cashflows.slice(0, 15).map((e) => (
              <li key={e.id} className="flex justify-between border-b border-zinc-900 py-1">
                <span>
                  {e.kind} · {e.note}
                </span>
                <span className="tabular-nums text-zinc-200">
                  {currency(e.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "corr" && (
        <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
          <p className="mb-3 text-sm font-semibold text-white">
            Top correlations (90d sparkline)
          </p>
          {corr.length === 0 ? (
            <p className="text-sm text-zinc-500">Need more history.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {corr.map((c) => (
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
        </div>
      )}

      {tab === "alerts" && (
        <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Target className="h-4 w-4 text-brand" /> Live alerts
          </div>
          {alerts.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Quiet — no earnings ≤7d or strikes under pressure.
            </p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2"
                >
                  <p className="text-sm font-medium text-amber-100">{a.title}</p>
                  <p className="text-xs text-amber-200/70">{a.detail}</p>
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
  stats: { name: string; value: number; roi: number; cash: number };
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
      <p className="text-xs text-zinc-500">Cash {currency(stats.cash)}</p>
    </div>
  );
}
