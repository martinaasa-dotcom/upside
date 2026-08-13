"use client";

import {
  allocationBySector,
  allocationByTicker,
  concentrationRead,
  themeBreakdown,
} from "@/lib/allocation";
import {
  buildPortfolioPersonality,
  THEME_COLOR,
} from "@/lib/portfolio-personality";
import {
  SHOCKS,
  getShockProfile,
  shockedPct,
  shockedPrice,
  type ShockId,
} from "@/lib/book-shock";
import type { LabDeepLink } from "@/components/OverviewDashboard";
import {
  correlationGrid,
  correlationMatrix,
} from "@/lib/correlation";
import { currency, percent, cn, cashtag } from "@/lib/format";
import { SeasonalityPage } from "@/components/SeasonalityPage";
import { TrendsPanel } from "@/components/TrendsPanel";
import type { OverviewModel } from "@/lib/overview";
import type { Holding, Portfolio, Quote } from "@/lib/types";
import { FlaskConical } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  overview: OverviewModel;
  portfolios: Portfolio[];
  /** Needed to re-scope the book down to a single sheet. */
  holdings: Holding[];
  quotes: Record<string, Quote>;
  /** Deep-link from Overview (pulse / seasonality). */
  intentTab?: LabDeepLink | null;
  onIntentConsumed?: () => void;
  /** Specific tab ids to hide, driven by the viewer's experience tier. */
  hiddenTabs?: string[];
};

type LabTab = "alloc" | "risk" | "trends" | "seasonality";

/** One flat row, ordered as a reading path: what you hold, how risky it
 * is, and when it tends to move. Pulse used to sit here but earns its own
 * top-level tab.
 *
 * Every tab carries a blurb because none of these names explain
 * themselves. "Shock" in particular told you nothing about what it did.
 */
const TABS: { id: LabTab; label: string; blurb: string }[] = [
  {
    id: "alloc",
    label: "Allocation",
    blurb:
      "What you own and how lopsided it is. Shows whether a few names quietly decide your whole year.",
  },
  {
    id: "risk",
    label: "Risk",
    blurb:
      "What a bad day would actually cost you. Pick a crash scenario to see the damage, and check whether your names tend to fall together.",
  },
  {
    id: "trends",
    label: "Trends",
    blurb:
      "Whether each holding is still in its trend, and which ones have started disagreeing with their own momentum. Weekly bars, so it reads regime changes rather than daily noise.",
  },
  {
    id: "seasonality",
    label: "Seasonality",
    blurb:
      "How the market has typically behaved at this time of year. History, not a prediction.",
  },
];

const INTENT_TO_TAB: Record<LabDeepLink, LabTab> = {
  seasonality: "seasonality",
};

/** Reads `?labtab=` so a hard refresh (or revisiting Lab after switching
 * away) lands back on the sub-tab you were on, not always Allocation.
 * Also honours the legacy `?sheet=stats` links from when Seasonality was
 * a top-level tab, so old bookmarks still land in the right place rather
 * than dumping you on Allocation. */
function initialLabTab(): LabTab {
  if (typeof window === "undefined") return "alloc";
  const params = new URLSearchParams(window.location.search);
  const param = params.get("labtab");
  if (TABS.some((t) => t.id === param)) return param as LabTab;

  const sheetParam = params.get("sheet")?.trim().toLowerCase();
  if (
    sheetParam === "stats" ||
    sheetParam === "statistics" ||
    sheetParam === "seasonality" ||
    sheetParam === "__seasonality__"
  ) {
    return "seasonality";
  }
  return "alloc";
}

export function LabSheet({
  overview,
  portfolios,
  holdings,
  quotes,
  intentTab,
  onIntentConsumed,
  hiddenTabs = [],
}: Props) {
  const visibleTabs = TABS.filter((t) => !hiddenTabs.includes(t.id));
  const [tab, setTab] = useState<LabTab>(() => {
    const fromUrl = initialLabTab();
    return visibleTabs.some((t) => t.id === fromUrl)
      ? fromUrl
      : visibleTabs[0]?.id ?? "alloc";
  });
  const tabScrollRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Partial<Record<LabTab, HTMLButtonElement | null>>>({});
  const [tabOverflow, setTabOverflow] = useState({ left: false, right: false });
  const [shock, setShock] = useState<ShockId>("none");
  /** What-if scope: full book or a single sheet */
  const [scopeId, setScopeId] = useState<string>("book");

  const activeTabMeta = TABS.find((t) => t.id === tab);

  function selectTab(id: LabTab) {
    setTab(id);
  }

  // The tab row can still scroll on a narrow phone, so keep the active tab
  // on screen. Arriving from a deep link or the command palette otherwise
  // left the highlight scrolled out of view.
  useEffect(() => {
    const el = tabRefs.current[tab];
    if (!el) return;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);

  // Edge fades, but only on the side that actually has more tabs, so the
  // row reads as scrollable instead of looking arbitrarily clipped.
  const syncTabOverflow = useCallback(() => {
    const el = tabScrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setTabOverflow({
      left: el.scrollLeft > 4,
      right: maxScroll > 4 && el.scrollLeft < maxScroll - 4,
    });
  }, []);

  useEffect(() => {
    syncTabOverflow();
    const el = tabScrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(syncTabOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncTabOverflow, visibleTabs.length]);

  // Mirror the sub-tab into the URL (replaceState only — sub-tab clicks
  // shouldn't pile onto the back-button stack the way top-level tab
  // switches do). Left in place when navigating away from Lab on purpose:
  // harmless when ignored elsewhere, and means coming back to Lab (even a
  // tab switch away and back, not just a refresh) restores the same
  // sub-tab instead of always resetting to Allocation.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("labtab", tab);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}`
    );
  }, [tab]);

  useEffect(() => {
    if (!intentTab) return;
    const id = INTENT_TO_TAB[intentTab];
    selectTab(id);
    onIntentConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentTab]);

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

  const scopeApplies = tab === "alloc" || tab === "risk";

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
  const themes = useMemo(() => themeBreakdown(sheetHoldings), [sheetHoldings]);
  const concentration = useMemo(
    () => concentrationRead(sheetHoldings),
    [sheetHoldings]
  );
  const personality = useMemo(
    () =>
      buildPortfolioPersonality(
        sheetHoldings.map((h) => ({ ticker: h.ticker, value: h.currentValue }))
      ),
    [sheetHoldings]
  );

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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/80 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-white">Lab</h2>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          Everything analytical about your book in one place.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
          <div className="flex min-h-8 items-center gap-2">
            <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-400">
              Scope
            </span>
            <select
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              disabled={!scopeApplies}
              className={cn(
                "min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs text-white sm:flex-none sm:shrink-0",
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
          </div>
          <span className="min-w-0 text-xs text-zinc-400">
            {scopeApplies
              ? `What-ifs run on ${scopeLabel}`
              : "Scope unused on this tool"}
          </span>
        </div>
        <div className="relative mt-3">
          <div
            ref={tabScrollRef}
            onScroll={syncTabOverflow}
            role="tablist"
            aria-label="Lab sections"
            className="scrollbar-none flex min-h-[2rem] gap-1 overflow-x-auto"
          >
            {visibleTabs.map((t) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => selectTab(t.id)}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-2 text-xs font-medium transition touch-target",
                  tab === t.id
                    ? "bg-brand/20 text-brand-bright ring-1 ring-inset ring-brand/40"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tabOverflow.left && (
            <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-[#161618] to-transparent" />
          )}
          {tabOverflow.right && (
            <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[#161618] to-transparent" />
          )}
        </div>
        {/* Says what the tab you just picked actually does. A label like
          * "Shock" or "Risk" means nothing on its own. */}
        {activeTabMeta && (
          <p className="mt-2.5 text-xs leading-relaxed text-zinc-400">
            {activeTabMeta.blurb}
          </p>
        )}
      </div>

      {tab === "alloc" && (
        <div className="space-y-4">
          {concentration.positionCount === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-6 text-center">
              <p className="text-sm text-zinc-400">
                No positions on {scopeLabel} yet. Add a holding and this fills
                in with your concentration read.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Diversification
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {personality.diversificationBand.description} ·{" "}
                      {scopeLabel}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold tabular-nums text-white">
                      {personality.diversificationScore}
                      <span className="text-sm text-zinc-400">/100</span>
                    </p>
                    <p className="text-xs font-medium text-brand-bright">
                      {personality.diversificationBand.label}
                    </p>
                  </div>
                </div>

                {/* A bare score gives no clue which end is which, so show the
                 * position on the scale and name both ends. */}
                <div className="mt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-brand/70 transition-all"
                      style={{
                        width: `${Math.max(2, Math.min(100, personality.diversificationScore))}%`,
                      }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-zinc-400">
                    <span>0 · all in one name</span>
                    <span>100 · index-broad</span>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <StatCell
                    label="Behaves like"
                    value={`${concentration.effectivePositions.toFixed(1)} names`}
                    hint={
                      concentration.positionCount === 1
                        ? "Your only position."
                        : `You hold ${concentration.positionCount}. Uneven weights make it act like fewer.`
                    }
                  />
                  <StatCell
                    label="Largest position"
                    value={`${(concentration.topWeightPct * 100).toFixed(1)}%`}
                    hint={concentration.topWeightTicker ?? ""}
                    tone={
                      concentration.topWeightPct >= 0.25 ? "warn" : "neutral"
                    }
                  />
                  {/* "Top 5" is tautologically 100% for a book of five or
                   * fewer, which reads as broken. Fall back to top 3, and
                   * drop the cell entirely when even that says nothing. */}
                  {concentration.positionCount > 3 && (
                    <StatCell
                      label={
                        concentration.positionCount > 5
                          ? "Top 5 combined"
                          : "Top 3 combined"
                      }
                      value={`${((concentration.positionCount > 5 ? concentration.topFivePct : concentration.topThreePct) * 100).toFixed(1)}%`}
                      hint={
                        (concentration.positionCount > 5
                          ? concentration.topFivePct
                          : concentration.topThreePct) >= 0.8
                          ? "The rest barely moves the needle."
                          : "The rest of the book carries real weight."
                      }
                      tone={
                        (concentration.positionCount > 5
                          ? concentration.topFivePct
                          : concentration.topThreePct) >= 0.8
                          ? "warn"
                          : "neutral"
                      }
                    />
                  )}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <StatCell
                    label="Modeled return"
                    value={`${personality.expectedAnnualReturnPct.toFixed(1)}%/yr`}
                    hint="Theme-weighted, not a forecast."
                  />
                  <StatCell
                    label="Drawdown potential"
                    value={`-${personality.maxDrawdownPct}%`}
                    hint="What this theme mix has historically given up."
                    tone={personality.maxDrawdownPct >= 50 ? "warn" : "neutral"}
                  />
                  <StatCell
                    label="Modeled alpha"
                    value={`${personality.modeledAlphaPct >= 0 ? "+" : ""}${personality.modeledAlphaPct.toFixed(1)}%`}
                    hint="Versus the risk you're taking (CAPM-style)."
                    tone={personality.modeledAlphaPct >= 0 ? "good" : "warn"}
                  />
                </div>
              </div>

              {themes.length > 0 && (
                <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4 sm:p-5">
                  <p className="text-sm font-semibold text-white">
                    What you&apos;re actually betting on
                  </p>
                  <p className="mt-0.5 mb-4 text-xs text-zinc-400">
                    Your holdings pooled by theme, which is usually a blunter
                    read than the ticker list.
                  </p>
                  <div className="flex h-3 overflow-hidden rounded-full bg-zinc-900">
                    {themes.map((t) => (
                      <div
                        key={t.theme}
                        style={{
                          width: `${Math.max(1.5, t.pct * 100)}%`,
                          backgroundColor: THEME_COLOR[t.theme],
                        }}
                        title={`${t.label}: ${Math.round(t.pct * 100)}%`}
                      />
                    ))}
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {themes.map((t) => (
                      <div
                        key={t.theme}
                        className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-3 py-2"
                      >
                        <span className="flex items-center gap-2 text-xs text-zinc-300">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: THEME_COLOR[t.theme] }}
                          />
                          {t.label}
                        </span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-400">
                          {Math.round(t.pct * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <AllocCard title="By sector" slices={sectors} />
                <AllocCard title="By ticker" slices={byTicker} />
              </div>
            </>
          )}
        </div>
      )}

      {tab === "trends" && (
        <TrendsPanel tickers={scopedTickers.map((t) => t.ticker)} />
      )}

      {tab === "seasonality" && (
        <SeasonalityPage bookTickers={overview.tickers.map((t) => t.ticker)} />
      )}

      {tab === "risk" && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-white">
                Crash test your book
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                Pick a scenario below and every position is repriced as if it
                had already happened, so you can see the damage in dollars
                before it costs you any. Each name moves by how exposed it is,
                not all by the same amount.
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Showing: {SHOCKS.find((s) => s.id === shock)?.tagline} ·{" "}
                {scopeLabel}
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
              <p className="text-zinc-400">Live</p>
              <p className="tabular-nums text-white">
                {currency(shockTotals.live)}
              </p>
            </div>
            <div>
              <p className="text-zinc-400">Shocked</p>
              <p className="tabular-nums text-white">
                {currency(shockTotals.shocked)}
              </p>
            </div>
            <div>
              <p className="text-zinc-400">Delta</p>
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
                <thead className="text-zinc-400">
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
                        {cashtag(r.ticker)}
                      </td>
                      <td className="max-w-[10rem] truncate py-1.5 pr-2 text-zinc-400">
                        {r.label}
                      </td>
                      <td
                        className={cn(
                          "py-1.5 pr-2 tabular-nums",
                          r.movePct === 0
                            ? "text-zinc-400"
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
                            ? "text-zinc-400"
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
                      <td colSpan={6} className="py-3 text-zinc-400">
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

      {tab === "risk" && (
        <div className="space-y-4 rounded-xl border border-zinc-800 bg-[#161618]/80 p-4">
          <div>
            <p className="text-sm font-semibold text-white">
              Do these move together?
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
              How closely each pair has tracked each other over the last 90
              days. Near <span className="tabular-nums">+1</span> means they
              rise and fall as one, so holding both spreads your money without
              spreading your risk. Near{" "}
              <span className="tabular-nums">0</span> means they drift
              independently, which is what real diversification looks like.
            </p>
          </div>
          {corrHeat.tickers.length < 2 ? (
            <p className="text-sm text-zinc-400">
              Need at least two names with price history to compare.
            </p>
          ) : (
            /* Grid and pair list sit side by side on wide screens: stacked,
             * the matrix was cramped at the top while a full-width list of
             * short "A ↔ B  0.82" rows wasted the whole lower half. The
             * matrix takes its natural width and the list fills the rest. */
            <div className="grid gap-5 lg:grid-cols-[auto_1fr] lg:items-start">
              <div className="min-w-0 overflow-x-auto">
                <table className="border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="p-1" />
                      {corrHeat.tickers.map((t) => (
                        <th
                          key={t}
                          className="p-1 text-xs font-medium text-zinc-400"
                        >
                          {cashtag(t)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {corrHeat.tickers.map((row, i) => (
                      <tr key={row}>
                        <td className="whitespace-nowrap p-1 pr-2 text-xs font-medium text-zinc-400">
                          {cashtag(row)}
                        </td>
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
                              className="flex h-10 w-10 items-center justify-center rounded-md tabular-nums text-xs font-medium text-zinc-100"
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
                {/* The two colours were never explained anywhere. */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ background: "rgba(212, 160, 64, 0.75)" }}
                    />
                    Move together
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ background: "rgba(56, 189, 248, 0.75)" }}
                    />
                    Move opposite
                  </span>
                  <span>Stronger colour = tighter link</span>
                </div>
              </div>

              <div className="min-w-0">
                <p className="mb-2 text-xs uppercase tracking-wide text-zinc-400">
                  Tightest pairs
                </p>
                <ul className="space-y-1">
                  {corrPairs.map((c) => (
                    <li
                      key={`${c.a}-${c.b}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-zinc-800/80 px-2.5 py-1.5 text-xs"
                    >
                      <span className="truncate text-zinc-300">
                        {cashtag(c.a)} ↔ {cashtag(c.b)}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 tabular-nums font-medium",
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
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-3 py-2.5">
      <p className="text-xs uppercase tracking-wide text-zinc-400">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-base font-semibold tabular-nums",
          tone === "good" && "text-gain",
          tone === "warn" && "text-amber-300",
          tone === "neutral" && "text-zinc-100"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-zinc-400">{hint}</p>}
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
          <p className="text-sm text-zinc-400">No equity to allocate.</p>
        )}
      </div>
    </div>
  );
}
