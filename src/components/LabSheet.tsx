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
import { ScenarioSimulator } from "@/components/ScenarioSimulator";
import { EmptyState, Panel, PanelHeader } from "@/components/ui/Panel";
import type { LabDeepLink } from "@/components/OverviewDashboard";
import {
  correlationGrid,
  correlationMatrix,
} from "@/lib/correlation";
import { currency, cn, cashtag } from "@/lib/format";
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

/** One flat row: what you hold, how risky it is, and when it tends to move. */
const TABS: { id: LabTab; label: string }[] = [
  { id: "alloc", label: "Allocation" },
  { id: "risk", label: "Risk" },
  { id: "trends", label: "Trends" },
  { id: "seasonality", label: "Seasonality" },
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
  /** What-if scope: full book or a single sheet */
  const [scopeId, setScopeId] = useState<string>("book");

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

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader
          icon={<FlaskConical className="h-4 w-4" />}
          title="Lab"
          actions={
            <label className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Looking at
              </span>
              <select
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                disabled={!scopeApplies}
                className={cn(
                  "min-w-0 rounded-lg border border-zinc-700 bg-zinc-950/50 px-2.5 py-1.5 text-xs text-white",
                  !scopeApplies && "cursor-not-allowed opacity-40"
                )}
                title={
                  scopeApplies
                    ? "Narrow these tools down to one sheet"
                    : "This tool always uses your whole book"
                }
              >
                <option value="book">Everything</option>
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          }
        />
        <div className="relative mt-4">
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
      </Panel>

      {tab === "alloc" && (
        <div className="space-y-4">
          {concentration.positionCount === 0 ? (
            <EmptyState
              title="Nothing to look at yet"
              detail={`Add a holding to ${scopeLabel} and this fills in with how spread out you are.`}
            />
          ) : (
            <>
              <Panel tone="plain">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-white">
                      How spread out you are
                    </h3>
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
                      Diversified
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

                <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                  The score above is how spread out the book is. Theme bars
                  below are a blunt read of what you&apos;re betting on, not a
                  return forecast.
                </p>
              </Panel>

              {themes.length > 0 && (
                <Panel tone="plain">
                  <h3 className="text-base font-semibold text-white">
                    What you&apos;re actually betting on
                  </h3>
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
                </Panel>
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
        <ScenarioSimulator
          holdings={scopedTickers}
          cash={scopedCash}
          scopeLabel={scopeLabel}
        />
      )}

      {tab === "risk" && (
        <Panel tone="plain" className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-white">
              Do these move together?
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
              How closely each pair has tracked each other over the last 90
              days, up to 8 names. Near <span className="tabular-nums">+1</span> means they
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
        </Panel>
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
    <Panel tone="plain">
      <h3 className="mb-3 text-base font-semibold text-white">{title}</h3>
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
    </Panel>
  );
}
