"use client";

import { AppHeader } from "@/components/AppHeader";
import { BookBottomNav } from "@/components/BookBottomNav";
import { MobileChrome } from "@/components/mobile/MobileChrome";
import { ComparisonChart, type ComparisonSeries } from "@/components/ComparisonChart";
import { Metric, MicroLabel, Stat } from "@/components/ui/Panel";
import { humanizeMargusText } from "@/lib/ai/humanize-copy";
import { plainError } from "@/lib/plain-error";
import { currency, percent, signedCurrency, cn, signedTone, cashtag } from "@/lib/format";
import { UPSIDE_PORTFOLIO_DISCLAIMER } from "@/lib/disclaimer";
import { pickLoadingMessage } from "@/lib/loading-messages";
import { quotePollMs, quotesUrl } from "@/lib/market/session";
import { concentrationRead, themeBreakdown } from "@/lib/allocation";
import {
  buildPortfolioPersonality,
  THEME_COLOR,
} from "@/lib/portfolio-personality";
import {
  fundDayNumber,
  liveFundTodayMove,
  liveFundTotalValue,
} from "@/lib/margus-fund-mark";
import { fundCopyBullets, recapBullets } from "@/lib/fund-copy";
import {
  sanitizeFundWatchlist,
  type FundWatchItem,
} from "@/lib/fund-watchlist";
import {
  loadUpsidePortfolioCache,
  saveUpsidePortfolioCache,
} from "@/lib/upside-portfolio-cache";
import { todayKeyInTz } from "@/lib/timezone";
import type { Quote } from "@/lib/types";
import {
  portfolioLiveValue,
  sheetReturnPathSince,
} from "@/lib/sheet-mark";
import {
  ChevronDown,
  ChevronRight,
  Minus,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BENCHMARK_STORAGE_KEY = "portfell-upside-portfolio-benchmark";
const SERIES_COLOR = {
  margus: "#fbbf24",
  spy: "#818cf8",
  you: "#f472b6",
} as const;

type MyPortfolioBenchmark = {
  portfolioId: string;
  portfolioName: string;
  baselineDate: string;
  userBaselineValue: number;
  margusBaselineValue: number;
  /** Recorded nights. Older pins may still say ytd. */
  range?: "ytd" | "recorded";
};

type YtdNavPoint = { date: string; nav: number };

function returnPctFromNav(
  points: YtdNavPoint[],
  live?: number | null
): { labels: string[]; pcts: number[] } {
  if (points.length < 2) return { labels: [], pcts: [] };
  const start = points[0]!.nav;
  if (!(start > 0)) return { labels: [], pcts: [] };
  const labels = points.map((p) => p.date);
  const pcts = points.map((p) => (p.nav - start) / start);
  if (live != null && Number.isFinite(live)) {
    labels.push("Live");
    pcts.push((live - start) / start);
  }
  return { labels, pcts };
}

function pctOnOrBefore(
  points: YtdNavPoint[],
  date: string,
  startNav: number
): number {
  if (!(startNav > 0)) return 0;
  let last = 0;
  for (const p of points) {
    if (p.date <= date) last = (p.nav - startNav) / startNav;
  }
  return last;
}

function margusOnLabels(
  labels: string[],
  reports: ReportRow[],
  live: number
): number[] {
  const chrono = [...reports].reverse();
  return labels.map((d) => {
    if (d === "Live") return live;
    let last = 0;
    for (const r of chrono) {
      if (r.report_date <= d) last = r.total_return_pct ?? 0;
    }
    return last;
  });
}

async function fetchRecordedPath(
  portfolioId: string
): Promise<{ sheet: YtdNavPoint[]; spy: YtdNavPoint[] }> {
  const res = await fetch("/api/book/nav-history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assumed: false,
      portfolioIds: [portfolioId],
      includeSpy: true,
    }),
  });
  if (!res.ok) return { sheet: [], spy: [] };
  const data = (await res.json()) as {
    points?: YtdNavPoint[];
    spyPoints?: YtdNavPoint[];
  };
  return { sheet: data.points ?? [], spy: data.spyPoints ?? [] };
}

function loadStoredBenchmark(): MyPortfolioBenchmark | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BENCHMARK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MyPortfolioBenchmark;
    if (!parsed?.portfolioId || !Number.isFinite(parsed.userBaselineValue)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStoredBenchmark(b: MyPortfolioBenchmark | null) {
  if (typeof window === "undefined") return;
  if (!b) {
    window.localStorage.removeItem(BENCHMARK_STORAGE_KEY);
  } else {
    window.localStorage.setItem(BENCHMARK_STORAGE_KEY, JSON.stringify(b));
  }
}

type MyPortfolioMeta = {
  id: string;
  name: string;
  cash_balance: number;
};

type MyHolding = {
  portfolio_id: string;
  ticker: string;
  shares: number;
  buy_price: number;
};

type FundRow = {
  cash: number;
  starting_capital: number;
  inception_date: string;
  watchlist?: FundWatchItem[] | null;
  cash_purpose?: string | null;
};

type HoldingRow = {
  id: string;
  ticker: string;
  shares: number;
  cost_basis: number;
  entry_date: string;
  thesis: string;
  target_timeframe: string | null;
  exit_plan: string | null;
  status: "open" | "closed";
  closed_at: string | null;
  exit_reasoning: string | null;
  realized_pnl: number | null;
};

type FundActionRow = {
  type: "hold" | "trim" | "add" | "exit" | "buy";
  ticker: string;
  reasoning: string;
  shares?: number;
  price?: number;
  dollarAmount?: number;
};

type WeeklyRecapRow = {
  id: string;
  week_ending: string;
  headline: string;
  body: string;
  week_return_pct: number | null;
  spy_week_return_pct: number | null;
  portfolio_value_start: number;
  portfolio_value_end: number;
};

type ReportRow = {
  id: string;
  report_date: string;
  headline: string;
  body: string;
  actions: FundActionRow[];
  portfolio_value: number;
  cash: number;
  day_change_dollar: number | null;
  day_change_pct: number | null;
  total_return_pct: number | null;
  spy_price: number | null;
};

/** Exactly what /api/upside-portfolio returns, and what gets cached. */
type FundPayload = {
  fund: FundRow | null;
  holdings: HoldingRow[];
  reports: ReportRow[];
  weeklyRecaps: WeeklyRecapRow[];
  quotes: Record<string, Quote>;
};

function fmtDate(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

const ACTION_STYLE: Record<
  FundActionRow["type"],
  { label: string; cls: string }
> = {
  buy: { label: "Opened", cls: "bg-emerald-500/15 text-emerald-300" },
  add: { label: "Added", cls: "bg-emerald-500/15 text-emerald-300" },
  trim: { label: "Trimmed", cls: "bg-amber-500/15 text-amber-300" },
  exit: { label: "Exited", cls: "bg-rose-500/15 text-rose-300" },
  hold: { label: "Held", cls: "bg-zinc-700/40 text-zinc-400" },
};

function ActionBadge({ action }: { action: FundActionRow }) {
  const meta = ACTION_STYLE[action.type];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
        meta.cls
      )}
    >
      {meta.label} {cashtag(action.ticker)}
    </span>
  );
}

/** Date + closing value + day move. Shared by the open latest report and
 * the collapsed summary row of every older one, so the two can't drift. */
function ReportMeta({ r }: { r: ReportRow }) {
  return (
    <>
      <p className="text-xs uppercase tracking-wide text-zinc-400">
        {fmtDate(r.report_date)}
      </p>
      <p
        className={cn(
          "text-xs font-semibold tabular-nums",
          signedTone(r.day_change_dollar ?? 0, "text-zinc-400")
        )}
      >
        {currency(r.portfolio_value, 0)}
        {r.day_change_dollar != null && (
          <> · {signedCurrency(r.day_change_dollar)}</>
        )}
      </p>
    </>
  );
}

/** The actual content: what he did, and why. */
function ReportDetail({ r }: { r: ReportRow }) {
  const moves = (r.actions ?? []).filter((a) => a.type !== "hold");
  return (
    <>
      {moves.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {moves.map((a, i) => (
            <ActionBadge key={`${a.ticker}-${i}`} action={a} />
          ))}
        </div>
      )}
      <RecapBody text={r.body} muted />
    </>
  );
}

function RecapBody({
  text,
  muted = false,
}: {
  text: string;
  muted?: boolean;
}) {
  const bullets = recapBullets(text);
  if (bullets.length === 0) return null;
  return (
    <ul
      className={cn(
        "space-y-1.5 text-sm leading-relaxed",
        muted ? "text-zinc-400" : "text-zinc-300"
      )}
    >
      {bullets.map((b) => (
        <li key={b} className="flex gap-2">
          <span
            aria-hidden
            className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-bright"
          />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

function freshnessLabel(quotesAt: number | null, nowMs: number): string {
  if (quotesAt == null) return "Loading prices …";
  const secs = Math.max(0, Math.round((nowMs - quotesAt) / 1000));
  if (secs < 10) return "Live · just now";
  if (secs < 90) return `Live · ${secs}s ago`;
  const mins = Math.round(secs / 60);
  return `Prices ${mins}m old`;
}

function FundStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-zinc-100">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}

function CopyBlock({
  label,
  items,
  tone = "thesis",
  extra,
  className,
}: {
  label: string;
  items: string[];
  tone?: "thesis" | "exit";
  extra?: string | null;
  className?: string;
}) {
  if (items.length === 0 && !extra) return null;
  const exit = tone === "exit";
  return (
    <div
      className={cn(
        exit
          ? "rounded-lg border border-rose-500/20 bg-rose-950/15 px-3 py-2.5"
          : "border-t border-zinc-800/60 pt-3",
        className
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <MicroLabel className={exit ? "text-rose-300/80" : undefined}>
          {label}
        </MicroLabel>
        {extra ? <p className="text-xs text-zinc-400">{extra}</p> : null}
      </div>
      {items.length > 0 && (
        <ul className="mt-1.5 space-y-1.5 text-sm leading-relaxed text-zinc-300">
          {items.map((b) => (
            <li key={b} className="flex gap-2">
              <span
                aria-hidden
                className={cn(
                  "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full",
                  exit ? "bg-rose-400/70" : "bg-brand-bright"
                )}
              />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function UpsidePortfolioPage() {
  // Paint the last known fund immediately; the fetch below still runs and
  // corrects it. Only a genuinely cold visit shows a loading line.
  const cachedRef = useRef<FundPayload | null>(null);
  if (cachedRef.current === null) {
    cachedRef.current =
      (loadUpsidePortfolioCache()?.payload as FundPayload | undefined) ?? null;
  }
  const cached = cachedRef.current;
  const loadCallIdRef = useRef(0);

  const [fund, setFund] = useState<FundRow | null>(cached?.fund ?? null);
  const [holdings, setHoldings] = useState<HoldingRow[]>(
    cached?.holdings ?? []
  );
  const [reports, setReports] = useState<ReportRow[]>(cached?.reports ?? []);
  const [weeklyRecaps, setWeeklyRecaps] = useState<WeeklyRecapRow[]>(
    cached?.weeklyRecaps ?? []
  );
  const [quotes, setQuotes] = useState<Record<string, Quote>>(
    cached?.quotes ?? {}
  );
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** When the currently displayed quotes landed. Null until the first
   * successful fetch: a cached first paint is real data but not fresh
   * data, and claiming otherwise would be a lie. */
  const [quotesAt, setQuotesAt] = useState<number | null>(null);

  // "Compare your own portfolio" opt-in benchmark — entirely client-side
  // (localStorage), since it's a personal viewing preference, not shared
  // fund state everyone else on this page should see.
  const [benchmark, setBenchmark] = useState<MyPortfolioBenchmark | null>(null);
  const [benchmarkLiveValue, setBenchmarkLiveValue] = useState<number | null>(null);
  const [benchmarkQuotes, setBenchmarkQuotes] = useState<Record<string, Quote>>(
    {}
  );
  const [myPortfolios, setMyPortfolios] = useState<MyPortfolioMeta[] | null>(null);
  const [myHoldings, setMyHoldings] = useState<MyHolding[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSelection, setPickerSelection] = useState("");
  const [benchmarkBusy, setBenchmarkBusy] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [sheetYtd, setSheetYtd] = useState<YtdNavPoint[] | null>(null);
  const [spyYtd, setSpyYtd] = useState<YtdNavPoint[] | null>(null);
  const [loadingMessage] = useState(pickLoadingMessage);

  const load = useCallback(async (mode: "initial" | "manual" | "background") => {
    // Three sources can be in flight at once here (first load, the 60s
    // poll, and manual refresh), so a slow one resolving last would
    // otherwise overwrite fresher numbers with stale ones. Only the most
    // recently started call is allowed to commit.
    const callId = ++loadCallIdRef.current;
    if (mode === "manual") setRefreshing(true);
    // A cached paint means the first fetch is really a background refresh:
    // never swap a populated page back to a loading line.
    else if (mode === "initial" && !cachedRef.current) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/upside-portfolio", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(plainError(data.error, "Couldn't load the Fund."));
      if (callId !== loadCallIdRef.current) return;
      setFund(data.fund);
      setHoldings(data.holdings ?? []);
      setReports(data.reports ?? []);
      setWeeklyRecaps(data.weeklyRecaps ?? []);
      setQuotes(data.quotes ?? {});
      setQuotesAt(Date.now());
      saveUpsidePortfolioCache({
        fund: data.fund,
        holdings: data.holdings ?? [],
        reports: data.reports ?? [],
        weeklyRecaps: data.weeklyRecaps ?? [],
        quotes: data.quotes ?? {},
      });
    } catch (e) {
      // Background polls fail silently rather than blanking an
      // already-loaded page over one flaky tick. A cache-backed first load
      // counts as already-loaded for the same reason: showing an error
      // over a perfectly readable page helps nobody.
      if (callId !== loadCallIdRef.current) return;
      if (mode !== "background" && !cachedRef.current) {
        setError(e instanceof Error ? e.message : "Couldn't load the Fund.");
      }
    } finally {
      // A superseded call must not clear the spinner belonging to the
      // newer one that's still running.
      if (callId === loadCallIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  useEffect(() => {
    setBenchmark(loadStoredBenchmark());
  }, []);

  const openHoldings = useMemo(
    () => holdings.filter((h) => h.status === "open"),
    [holdings]
  );
  const closedHoldings = useMemo(
    () => holdings.filter((h) => h.status === "closed"),
    [holdings]
  );

  const latestReport = reports[0] ?? null;
  const fundRef = useRef(fund);
  fundRef.current = fund;
  const oldestReport = reports[reports.length - 1] ?? null;
  const cash = latestReport?.cash ?? fund?.cash ?? 0;
  // Live, not frozen at the last daily snapshot — same formula as the
  // Overview teaser so the two surfaces never disagree.
  const totalValue = liveFundTotalValue({
    cash,
    holdings: openHoldings,
    quotes,
  });

  // Same engine Lab uses on your own book, so "what is Margus actually
  // betting on" reads in the same units as your own concentration page
  // rather than being a bespoke one-off chart.
  const fundValued = useMemo(
    () =>
      openHoldings.map((h) => ({
        ticker: h.ticker,
        currentValue: h.shares * (quotes[h.ticker]?.price ?? h.cost_basis),
      })),
    [openHoldings, quotes]
  );
  const fundThemes = useMemo(() => themeBreakdown(fundValued), [fundValued]);
  const fundWatchlist = useMemo(
    () =>
      sanitizeFundWatchlist(
        fund?.watchlist,
        openHoldings.map((h) => h.ticker)
      ),
    [fund?.watchlist, openHoldings]
  );
  const watchingNote = useMemo(() => {
    const body = latestReport?.body;
    if (!body) return null;
    const parts = body
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const last = parts.at(-1);
    return last && last.length >= 12 ? last : null;
  }, [latestReport?.body]);
  const bettingSlices = useMemo(() => {
    const slices: {
      key: string;
      label: string;
      pct: number;
      color: string;
    }[] = fundThemes.map((t) => ({
      key: t.theme,
      label: t.label,
      pct: totalValue > 0 ? t.value / totalValue : t.pct,
      color: THEME_COLOR[t.theme],
    }));
    if (cash > 0 && totalValue > 0) {
      slices.push({
        key: "cash",
        label: "Cash",
        pct: cash / totalValue,
        color: "#71717a",
      });
    }
    return slices;
  }, [fundThemes, cash, totalValue]);
  const fundConcentration = useMemo(
    () => concentrationRead(fundValued),
    [fundValued]
  );
  const fundPersonality = useMemo(
    () =>
      buildPortfolioPersonality(
        fundValued.map((h) => ({ ticker: h.ticker, value: h.currentValue })),
        cash
      ),
    [fundValued, cash]
  );
  const totalReturnDollar = totalValue - (fund?.starting_capital ?? 0);
  const totalReturnPct =
    fund && fund.starting_capital > 0 ? totalReturnDollar / fund.starting_capital : 0;
  const { todayDollar, todayPct } = liveFundTodayMove({
    liveTotal: totalValue,
    lastReportValue: latestReport?.portfolio_value,
  });

  const dayNumber = fundDayNumber(fund?.inception_date);

  // SPY "equally-funded" benchmark — inception price comes from the oldest
  // stored report once one exists; before day one runs, today's live price
  // doubles as inception (so it fairly starts at 0%, not a stale number).
  const spyLivePrice = quotes.SPY?.price ?? null;
  const spyInceptionPrice = oldestReport?.spy_price ?? spyLivePrice;
  const spyReturnPct =
    spyInceptionPrice && spyLivePrice
      ? (spyLivePrice - spyInceptionPrice) / spyInceptionPrice
      : 0;

  // Both series end with a live point, not the last daily snapshot — the
  // chart's rightmost edge moves with the market intraday, then "locks
  // in" once tomorrow's cron writes the next real report.
  const margusReturnSeries = useMemo(() => {
    const historical = [...reports].reverse().map((r) => r.total_return_pct ?? 0);
    return [...historical, totalReturnPct];
  }, [reports, totalReturnPct]);
  const spyReturnSeries = useMemo(() => {
    const chronological = [...reports].reverse();
    const firstPrice =
      chronological.find((r) => r.spy_price != null)?.spy_price ?? null;
    const historical =
      !firstPrice
        ? []
        : chronological.map((r) =>
            r.spy_price != null ? (r.spy_price - firstPrice) / firstPrice : 0
          );
    return [...historical, spyReturnPct];
  }, [reports, spyReturnPct]);

  const ytdSheetPath = useMemo(
    () =>
      sheetYtd && sheetYtd.length >= 2
        ? returnPctFromNav(sheetYtd, benchmarkLiveValue)
        : null,
    [sheetYtd, benchmarkLiveValue]
  );

  const comparisonLabels = useMemo(() => {
    if (benchmark && ytdSheetPath && ytdSheetPath.labels.length >= 2) {
      return ytdSheetPath.labels;
    }
    const dates = [...reports].reverse().map((r) => r.report_date);
    return [...dates, "Live"];
  }, [benchmark, ytdSheetPath, reports]);

  const youReturnSeries = useMemo(() => {
    if (!benchmark) return null;
    if (ytdSheetPath && ytdSheetPath.pcts.length >= 2) return ytdSheetPath.pcts;
    const meta = myPortfolios?.find((p) => p.id === benchmark.portfolioId) ?? {
      id: benchmark.portfolioId,
      cash_balance: 0,
    };
    if (benchmarkLiveValue == null) return null;
    const points = sheetReturnPathSince({
      labels: comparisonLabels,
      baselineDate: benchmark.baselineDate,
      baselineValue: benchmark.userBaselineValue,
      liveValue: benchmarkLiveValue,
      meta,
      holdings: myHoldings,
      quotes: benchmarkQuotes,
    });
    return points.length >= 2 ? points : null;
  }, [
    benchmark,
    benchmarkLiveValue,
    benchmarkQuotes,
    comparisonLabels,
    myHoldings,
    myPortfolios,
    ytdSheetPath,
  ]);

  const spyYtdSeries = useMemo(() => {
    if (!benchmark || !spyYtd || spyYtd.length < 2) return null;
    const start = spyYtd[0]!.nav;
    if (!(start > 0)) return null;
    return comparisonLabels.map((d) => {
      if (d === "Live") {
        return spyLivePrice != null ? (spyLivePrice - start) / start : pctOnOrBefore(spyYtd, "9999-12-31", start);
      }
      return pctOnOrBefore(spyYtd, d, start);
    });
  }, [benchmark, spyYtd, comparisonLabels, spyLivePrice]);

  const margusYtdSeries = useMemo(() => {
    if (!benchmark || !ytdSheetPath) return null;
    return margusOnLabels(comparisonLabels, reports, totalReturnPct);
  }, [benchmark, ytdSheetPath, comparisonLabels, reports, totalReturnPct]);

  const comparisonSeries: ComparisonSeries[] = useMemo(() => {
    const margusPts = margusYtdSeries ?? margusReturnSeries;
    const spyPts = spyYtdSeries ?? spyReturnSeries;
    const rows: ComparisonSeries[] = [
      { label: "Margus", color: SERIES_COLOR.margus, points: margusPts },
      { label: "SPY", color: SERIES_COLOR.spy, points: spyPts },
    ];
    if (benchmark && youReturnSeries) {
      const youDollar =
        benchmarkLiveValue != null
          ? benchmarkLiveValue - benchmark.userBaselineValue
          : null;
      rows.splice(1, 0, {
        label: benchmark.portfolioName,
        color: SERIES_COLOR.you,
        points: youReturnSeries,
        hint: youDollar != null ? signedCurrency(youDollar, 0) : undefined,
      });
    }
    return rows;
  }, [
    benchmark,
    benchmarkLiveValue,
    margusReturnSeries,
    margusYtdSeries,
    spyReturnSeries,
    spyYtdSeries,
    youReturnSeries,
  ]);

  const fetchMyPortfolios = useCallback(async (): Promise<{
    portfolios: MyPortfolioMeta[];
    holdingsList: MyHolding[];
  }> => {
    const res = await fetch("/api/portfolios", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(plainError(data.error, "Couldn't load your sheets."));
    const portfolios: MyPortfolioMeta[] = (data.portfolios ?? []).map(
      (p: { id: string; name: string; cash_balance?: number }) => ({
        id: p.id,
        name: p.name,
        cash_balance: Number(p.cash_balance ?? 0),
      })
    );
    const holdingsList: MyHolding[] = (data.holdings ?? []).map(
      (h: {
        portfolio_id: string;
        ticker: string;
        shares?: number;
        buy_price?: number;
      }) => ({
        portfolio_id: h.portfolio_id,
        ticker: String(h.ticker ?? "").toUpperCase(),
        shares: Number(h.shares ?? 0),
        buy_price: Number(h.buy_price ?? 0),
      })
    );
    setMyPortfolios(portfolios);
    setMyHoldings(holdingsList);
    return { portfolios, holdingsList };
  }, []);

  const valueForPortfolio = useCallback(
    async (
      portfolioId: string,
      portfolios: MyPortfolioMeta[],
      holdingsList: MyHolding[]
    ): Promise<{
      meta: MyPortfolioMeta;
      live: number;
      quotes: Record<string, Quote>;
    }> => {
      const meta = portfolios.find((p) => p.id === portfolioId);
      if (!meta) throw new Error("Sheet not found");
      const tickers = [
        ...new Set(
          holdingsList
            .filter((h) => h.portfolio_id === portfolioId)
            .map((h) => h.ticker)
        ),
      ];
      let liveQuotes: Record<string, Quote> = {};
      if (tickers.length > 0) {
        const res = await fetch(quotesUrl(tickers));
        if (!res.ok) throw new Error(`Quotes fetch failed (${res.status})`);
        const data = await res.json();
        liveQuotes = data.quotes ?? {};
      }
      return {
        meta,
        live: portfolioLiveValue(meta, holdingsList, liveQuotes),
        quotes: liveQuotes,
      };
    },
    []
  );

  const refreshBenchmarkValue = useCallback(async () => {
    if (!benchmark) return;
    try {
      const { portfolios, holdingsList } = await fetchMyPortfolios();
      if (!portfolios.some((p) => p.id === benchmark.portfolioId)) {
        setBenchmark(null);
        setBenchmarkLiveValue(null);
        setBenchmarkQuotes({});
        saveStoredBenchmark(null);
        return;
      }
      const { meta, live, quotes: liveQuotes } = await valueForPortfolio(
        benchmark.portfolioId,
        portfolios,
        holdingsList
      );
      setBenchmarkLiveValue(live);
      setBenchmarkQuotes(liveQuotes);

      const { sheet, spy } = await fetchRecordedPath(benchmark.portfolioId);
      if (sheet.length >= 2) {
        setSheetYtd(sheet);
        setSpyYtd(spy);
        const first = sheet[0]!;
        const needsHeal =
          benchmark.range !== "recorded" ||
          benchmark.baselineDate !== first.date ||
          (first.nav > 0 &&
            Math.abs(first.nav - benchmark.userBaselineValue) > 1);
        if (needsHeal) {
          const healed: MyPortfolioBenchmark = {
            ...benchmark,
            baselineDate: first.date,
            userBaselineValue:
              first.nav > 0 ? first.nav : benchmark.userBaselineValue,
            margusBaselineValue:
              fundRef.current?.starting_capital ??
              benchmark.margusBaselineValue,
            range: "recorded",
          };
          saveStoredBenchmark(healed);
          setBenchmark(healed);
        }
      }
    } catch {
      /* keep last-known value on transient failure, non-critical */
    }
  }, [benchmark, valueForPortfolio, fetchMyPortfolios]);

  // Refresh the live value of an already-set benchmark whenever it loads.
  useEffect(() => {
    void refreshBenchmarkValue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchmark?.portfolioId]);

  /**
   * Live quotes move all day, so re-poll rather than freezing at whatever
   * the last daily report captured.
   *
   * The callbacks go through a ref on purpose. refreshBenchmarkValue is
   * keyed to `benchmark` and re-heals that object, so listing it as a
   * dependency tore down and re-armed this interval every time the
   * benchmark identity changed, restarting the countdown from zero. With a
   * long interval that is a good way to never fire at all.
   */
  const pollRef = useRef({ load, refreshBenchmarkValue });
  pollRef.current = { load, refreshBenchmarkValue };

  useEffect(() => {
    function tick() {
      if (document.hidden) return;
      void pollRef.current.load("background");
      void pollRef.current.refreshBenchmarkValue();
    }
    // Re-armed each cycle rather than a fixed interval, so the cadence drops
    // to a trickle once New York closes and picks back up at the open.
    let timer = 0;
    function schedule() {
      timer = window.setTimeout(
        () => {
          tick();
          schedule();
        },
        quotePollMs()
      );
    }
    tick();
    schedule();
    // Coming back to the tab shouldn't mean waiting out a full interval to
    // see how far the market moved while you were away.
    function onVisible() {
      if (!document.hidden) tick();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Drives the "updated Ns ago" label. Only ticks while the tab is
  // visible, so a backgrounded page isn't re-rendering once a second.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleOpenPicker = useCallback(async () => {
    setBenchmarkError(null);
    setPickerOpen(true);
    if (!myPortfolios) {
      try {
        await fetchMyPortfolios();
      } catch (e) {
        setBenchmarkError(e instanceof Error ? e.message : "Couldn't load your sheets.");
      }
    }
  }, [myPortfolios, fetchMyPortfolios]);

  const handleSetBenchmark = useCallback(async () => {
    if (!pickerSelection || !myPortfolios) return;
    setBenchmarkBusy(true);
    setBenchmarkError(null);
    try {
      const { meta, live, quotes: liveQuotes } = await valueForPortfolio(
        pickerSelection,
        myPortfolios,
        myHoldings
      );
      const { sheet, spy } = await fetchRecordedPath(pickerSelection);
      if (sheet.length < 2) {
        setBenchmarkError(
          "Need a few recorded nights on this sheet first."
        );
        return;
      }
      setSheetYtd(sheet);
      setSpyYtd(spy.length >= 2 ? spy : null);
      const first = sheet[0]!;
      const next: MyPortfolioBenchmark = {
        portfolioId: pickerSelection,
        portfolioName: meta.name,
        baselineDate: first.date,
        userBaselineValue: first.nav > 0 ? first.nav : live,
        margusBaselineValue: fund?.starting_capital ?? totalValue,
        range: "recorded",
      };
      saveStoredBenchmark(next);
      setBenchmark(next);
      setBenchmarkLiveValue(live);
      setBenchmarkQuotes(liveQuotes);
      setPickerOpen(false);
    } catch (e) {
      setBenchmarkError(e instanceof Error ? e.message : "Couldn't set that comparison.");
    } finally {
      setBenchmarkBusy(false);
    }
  }, [
    pickerSelection,
    myPortfolios,
    myHoldings,
    valueForPortfolio,
    totalValue,
    fund?.starting_capital,
  ]);

  const handleClearBenchmark = useCallback(() => {
    saveStoredBenchmark(null);
    setBenchmark(null);
    setBenchmarkLiveValue(null);
    setBenchmarkQuotes({});
    setSheetYtd(null);
    setSpyYtd(null);
    setPickerSelection("");
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-app text-zinc-100 md:bg-[radial-gradient(ellipse_at_top,_#100e0a_0%,_#08090C_55%)]">
      <MobileChrome title="Upside Fund" active="circle" />
      <AppHeader className="hidden md:block" title="Upside Fund">
        <span
          className="inline-flex items-center gap-1.5 text-xs tabular-nums text-zinc-400"
          title="Prices include pre-market and after hours, not just the regular close"
          aria-label={freshnessLabel(quotesAt, nowMs)}
        >
          {quotesAt != null && (
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
            />
          )}
          <span className="hidden tabular-nums xs:inline">
            {freshnessLabel(quotesAt, nowMs)}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            void load("manual");
            void refreshBenchmarkValue();
          }}
          disabled={refreshing}
          aria-label="Refresh prices"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </AppHeader>

      <main className="mx-auto max-w-4xl flex-1 space-y-6 px-4 pt-6 pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <div>
          <h1 className="sr-only">Upside Fund</h1>
          <p className="text-sm leading-relaxed text-zinc-400">
            One decision a day in public. Every trade has a why, a timeline,
            and an exit plan.
            <span className="text-zinc-500">
              {" "}
              Day {dayNumber}
              {fund ? ` · started ${fmtDate(fund.inception_date)}` : ""}
            </span>
          </p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            {UPSIDE_PORTFOLIO_DISCLAIMER}
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-400">{loadingMessage}</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <>
            <section className="rounded-2xl border border-brand-deep/30 bg-card/80 p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Total value"
                  value={currency(totalValue, 0)}
                />
                <Stat
                  label="Today"
                  value={signedCurrency(todayDollar, 0)}
                  sub={todayPct != null ? percent(todayPct) : undefined}
                  valueClassName={signedTone(todayDollar, "text-white")}
                  subClassName={signedTone(todayDollar, "text-zinc-400")}
                />
                <Stat
                  label="Total return"
                  value={percent(totalReturnPct)}
                  sub={signedCurrency(totalReturnDollar, 0)}
                  valueClassName={signedTone(totalReturnDollar, "text-white")}
                  subClassName={signedTone(totalReturnDollar, "text-zinc-400")}
                />
                <Stat
                  label="Cash"
                  value={currency(cash, 0)}
                  sub={
                    fund?.cash_purpose?.trim() ||
                    `of ${currency(fund?.starting_capital ?? 0, 0)} start`
                  }
                />
              </div>
            </section>

            <section className="rounded-2xl border border-brand-deep/30 bg-card/80 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-white">
                    {benchmark
                      ? `${benchmark.portfolioName}, Margus, and SPY`
                      : "Margus vs SPY"}
                  </h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                    {benchmark
                      ? `${benchmark.portfolioName} on nights we recorded. Margus from when the fund started. SPY is the real index.`
                      : "How the fund has moved versus the S&P 500, as a percent."}
                  </p>
                </div>
                {benchmark ? (
                  <button
                    type="button"
                    onClick={handleClearBenchmark}
                    className="shrink-0 text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    Remove
                  </button>
                ) : !pickerOpen ? (
                  <button
                    type="button"
                    onClick={() => void handleOpenPicker()}
                    className="shrink-0 text-xs font-medium text-brand-bright hover:text-brand"
                  >
                    Compare my sheet
                  </button>
                ) : null}
              </div>

              {!benchmark && pickerOpen && (
                <div className="mt-3 space-y-2">
                  {myPortfolios === null ? (
                    <p className="text-sm text-zinc-400">Loading your sheets …</p>
                  ) : myPortfolios.length === 0 ? (
                    <p className="text-sm text-zinc-400">
                      You don&apos;t have any sheets to compare yet.
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <select
                          value={pickerSelection}
                          onChange={(e) => setPickerSelection(e.target.value)}
                          className="touch-target appearance-none rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 pr-8 text-sm text-zinc-200 focus:border-brand-mid focus:outline-none"
                        >
                          <option value="">Choose a sheet …</option>
                          {myPortfolios.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSetBenchmark()}
                        disabled={!pickerSelection || benchmarkBusy}
                        className="touch-target rounded-md bg-brand/20 px-3 py-1.5 text-sm font-semibold text-brand-bright hover:bg-brand/30 disabled:opacity-50"
                      >
                        {benchmarkBusy ? "Adding …" : "Add"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPickerOpen(false)}
                        className="touch-target rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:text-zinc-300"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {benchmarkError && (
                    <p className="text-sm text-red-400">{benchmarkError}</p>
                  )}
                </div>
              )}

              <ComparisonChart
                className="mt-4"
                series={comparisonSeries}
                labels={comparisonLabels}
              />
            </section>

            {bettingSlices.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  What he&apos;s betting on
                </h2>
                <div className="rounded-2xl border border-brand-deep/30 bg-card/80 p-4">
                  <div className="flex h-3 overflow-hidden rounded-full bg-zinc-900">
                    {bettingSlices.map((t) => (
                      <div
                        key={t.key}
                        style={{
                          width: `${Math.max(1.5, t.pct * 100)}%`,
                          backgroundColor: t.color,
                        }}
                        title={`${t.label}: ${Math.round(t.pct * 100)}%`}
                      />
                    ))}
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {bettingSlices.map((t) => (
                      <div
                        key={t.key}
                        className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-3 py-2"
                      >
                        <span className="flex items-center gap-2 text-xs text-zinc-300">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: t.color }}
                          />
                          {t.label}
                        </span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-zinc-400">
                          {Math.round(t.pct * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-2 border-t border-zinc-800/60 pt-4 sm:grid-cols-4">
                    <FundStat
                      label="Spread"
                      value={fundPersonality.diversificationBand.label}
                      hint={`Behaves like ${fundConcentration.effectivePositions.toFixed(1)} names`}
                    />
                    <FundStat
                      label="Biggest bet"
                      value={`${(fundConcentration.topWeightPct * 100).toFixed(0)}%`}
                      hint={fundConcentration.topWeightTicker ?? ""}
                    />
                    <FundStat
                      label="Risk"
                      value={fundPersonality.riskBand.label}
                      hint={`Could fall ${fundPersonality.maxDrawdownPct}% in a bad stretch`}
                    />
                    <FundStat
                      label="Cash"
                      value={`${totalValue > 0 ? Math.round((cash / totalValue) * 100) : 0}%`}
                      hint={
                        fund?.cash_purpose?.trim() ||
                        `of ${currency(fund?.starting_capital ?? 0, 0)} start`
                      }
                    />
                  </div>
                  {fund?.cash_purpose?.trim() ? (
                    <div className="mt-4 border-t border-zinc-800/60 pt-4">
                      <MicroLabel>Cash is sitting for</MicroLabel>
                      <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">
                        {fund.cash_purpose.trim()}
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-4 border-t border-zinc-800/60 pt-4">
                    <MicroLabel>Watching</MicroLabel>
                    {fundWatchlist.length > 0 ? (
                      <ul className="mt-2 space-y-2">
                        {fundWatchlist.map((w) => (
                          <li
                            key={w.ticker}
                            className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-3 py-2"
                          >
                            <span className="shrink-0 text-sm font-semibold text-white">
                              {cashtag(w.ticker)}
                            </span>
                            <span className="min-w-0 text-right text-sm leading-relaxed text-zinc-400">
                              {w.waitFor}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                        {watchingNote ??
                          "He'll name names in the next daily report."}
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {openHoldings.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  Open positions · {openHoldings.length}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {openHoldings.map((h) => {
                    const q = quotes[h.ticker];
                    const price = q?.price ?? h.cost_basis;
                    const pnlPct =
                      h.cost_basis > 0 ? (price - h.cost_basis) / h.cost_basis : 0;
                    const marketValue = price * h.shares;
                    const thesis = fundCopyBullets(h.thesis);
                    const exits = fundCopyBullets(h.exit_plan);
                    return (
                      <div
                        key={h.id}
                        className="rounded-xl border border-brand-deep/30 bg-card/80 p-3.5"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-base font-semibold text-white">
                            {cashtag(h.ticker)}
                          </span>
                          <span
                            className={cn(
                              "flex items-center gap-1 text-sm font-semibold tabular-nums",
                              pnlPct >= 0 ? "text-gain" : "text-loss"
                            )}
                          >
                            {pnlPct >= 0 ? (
                              <TrendingUp className="h-3.5 w-3.5" />
                            ) : (
                              <TrendingDown className="h-3.5 w-3.5" />
                            )}
                            {percent(pnlPct)}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                          <Metric label="Entered">
                            {fmtDate(h.entry_date)}
                          </Metric>
                          <Metric label="Cost">{currency(h.cost_basis)}</Metric>
                          <Metric
                            label="Now"
                            valueClassName={signedTone(pnlPct, "text-zinc-100")}
                          >
                            {currency(price)}
                          </Metric>
                          <Metric
                            label="Book"
                            hint={`${h.shares.toLocaleString("en-US")} sh`}
                          >
                            {currency(marketValue, 0)}
                          </Metric>
                        </div>
                        <CopyBlock
                          label="Thesis"
                          items={thesis}
                          extra={
                            h.target_timeframe
                              ? `Timeline ${h.target_timeframe}`
                              : null
                          }
                          className="mt-3"
                        />
                        <CopyBlock
                          label="Exit"
                          items={exits}
                          tone="exit"
                          className="mt-3"
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {weeklyRecaps.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  Weekly recap
                </h2>
                <div className="space-y-3">
                  {weeklyRecaps.map((r) => (
                    <article
                      key={r.id}
                      className="space-y-2 rounded-2xl border border-brand-mid/30 bg-gradient-to-br from-brand/10 via-[#161618]/70 to-[#161618]/70 p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-xs uppercase tracking-wide text-brand-bright">
                          Week of {fmtDate(r.week_ending)}
                        </p>
                        {r.week_return_pct != null && (
                          <p className="text-xs font-semibold tabular-nums">
                            <span className={r.week_return_pct >= 0 ? "text-gain" : "text-loss"}>
                              {percent(r.week_return_pct)}
                            </span>
                            {r.spy_week_return_pct != null && (
                              <span className="ml-2 text-zinc-400">
                                SPY {percent(r.spy_week_return_pct)}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <h3 className="text-base font-semibold text-white">
                        {humanizeMargusText(r.headline)}
                      </h3>
                      <RecapBody text={r.body} />
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Daily reports
              </h2>
              {reports.length === 0 ? (
                <p className="rounded-2xl border border-brand-deep/30 bg-card/80 px-4 py-6 text-center text-sm text-zinc-400">
                  No reports yet. Margus&apos;s first daily decision runs
                  after today&apos;s market close.
                </p>
              ) : (
                /* Today's report reads in full; every earlier one collapses
                 * to its date, close and headline. Otherwise the page grows
                 * an unreadable wall of prose one day at a time, and the
                 * decision you actually came to read sits on top of weeks of
                 * history. <details> keeps it keyboard and screen-reader
                 * friendly without any open/closed state to manage. */
                <div className="space-y-3">
                  {reports.map((r, i) =>
                    i === 0 ? (
                      <article
                        key={r.id}
                        className="space-y-2 rounded-2xl border border-brand-deep/30 bg-card/80 p-4"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <ReportMeta r={r} />
                        </div>
                        <h3 className="text-sm font-semibold text-white">
                          {humanizeMargusText(r.headline)}
                        </h3>
                        <ReportDetail r={r} />
                      </article>
                    ) : (
                      <details
                        key={r.id}
                        className="group overflow-hidden rounded-2xl border border-zinc-800 bg-card/50"
                      >
                        <summary className="flex list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-zinc-900/40 [&::-webkit-details-marker]:hidden">
                          <ChevronRight
                            aria-hidden
                            className="h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform group-open:rotate-90"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">
                            {humanizeMargusText(r.headline)}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <ReportMeta r={r} />
                          </span>
                        </summary>
                        <div className="space-y-2 border-t border-zinc-800/60 px-4 py-3">
                          <ReportDetail r={r} />
                        </div>
                      </details>
                    )
                  )}
                </div>
              )}
            </section>

            {closedHoldings.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  Closed positions · {closedHoldings.length}
                </h2>
                <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-brand-deep/30 bg-card/80">
                  {closedHoldings.map((h) => (
                    <li key={h.id} className="px-4 py-2.5 text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-zinc-200">
                          {cashtag(h.ticker)}
                        </span>
                        <span
                          className={cn(
                            "flex items-center gap-1 text-xs font-semibold tabular-nums",
                            (h.realized_pnl ?? 0) >= 0 ? "text-gain" : "text-loss"
                          )}
                        >
                          {(h.realized_pnl ?? 0) >= 0 ? (
                            <Plus className="h-3 w-3" />
                          ) : (
                            <Minus className="h-3 w-3" />
                          )}
                          {currency(Math.abs(h.realized_pnl ?? 0), 0)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {fmtDate(h.entry_date)} → {h.closed_at ? fmtDate(h.closed_at) : "—"}
                        {h.exit_reasoning ? ` · ${h.exit_reasoning}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
      <BookBottomNav />
    </div>
  );
}
