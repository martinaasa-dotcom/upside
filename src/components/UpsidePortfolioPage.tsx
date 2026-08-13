"use client";

import { AppHeader } from "@/components/AppHeader";
import { BookBottomNav } from "@/components/BookBottomNav";
import { ComparisonChart, type ComparisonSeries } from "@/components/ComparisonChart";
import { humanizeMargusText } from "@/lib/ai/humanize-copy";
import { currency, percent, signedCurrency, cn, signedTone, cashtag } from "@/lib/format";
import { UPSIDE_PORTFOLIO_DISCLAIMER } from "@/lib/disclaimer";
import { pickLoadingMessage } from "@/lib/loading-messages";
import { marketSession, quotesUrl } from "@/lib/market/session";
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
import {
  loadUpsidePortfolioCache,
  saveUpsidePortfolioCache,
} from "@/lib/upside-portfolio-cache";
import type { Quote } from "@/lib/types";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Minus,
  Plus,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
  X,
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
};

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

function portfolioValueAt(
  meta: MyPortfolioMeta,
  holdings: MyHolding[],
  quotes: Record<string, Quote>,
  priceOf: (q: Quote | undefined, fallback: number) => number
): number {
  const equity = holdings
    .filter((h) => h.portfolio_id === meta.id)
    .reduce((sum, h) => sum + h.shares * priceOf(quotes[h.ticker], h.buy_price), 0);
  return meta.cash_balance + equity;
}

function portfolioLiveValue(
  meta: MyPortfolioMeta,
  holdings: MyHolding[],
  quotes: Record<string, Quote>
): number {
  return portfolioValueAt(meta, holdings, quotes, (q, fallback) => q?.price ?? fallback);
}

/** Yesterday's close ≈ today's open — used so a benchmark set up mid-day
 * still reflects the day's full move instead of reading ~0% just because
 * you clicked "set benchmark" a few hours after the open. */
function portfolioValueAtPreviousClose(
  meta: MyPortfolioMeta,
  holdings: MyHolding[],
  quotes: Record<string, Quote>
): number {
  return portfolioValueAt(
    meta,
    holdings,
    quotes,
    (q, fallback) => q?.previousClose ?? fallback
  );
}

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

type FundRow = {
  cash: number;
  starting_capital: number;
  inception_date: string;
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

/** Fast enough that the page reads as live without hammering the free
 * quote tiers. My book polls on a similar cadence. */
const QUOTE_POLL_MS = 30_000;
const CLOSED_POLL_MS = 20 * 60_000;

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
      <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-400">
        {humanizeMargusText(r.body)}
      </p>
    </>
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
  const [myPortfolios, setMyPortfolios] = useState<MyPortfolioMeta[] | null>(null);
  const [myHoldings, setMyHoldings] = useState<MyHolding[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSelection, setPickerSelection] = useState("");
  const [benchmarkBusy, setBenchmarkBusy] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
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
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
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
        setError(e instanceof Error ? e.message : "Failed to load");
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
  // Read inside refreshBenchmarkValue without adding `reports` to its
  // dependency array (that callback is intentionally only keyed off
  // benchmark identity so the 60s poll effect doesn't get torn down and
  // rebuilt every time a new report or quote tick comes in).
  const latestReportRef = useRef(latestReport);
  latestReportRef.current = latestReport;
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
  const fundConcentration = useMemo(
    () => concentrationRead(fundValued),
    [fundValued]
  );
  const fundPersonality = useMemo(
    () =>
      buildPortfolioPersonality(
        fundValued.map((h) => ({ ticker: h.ticker, value: h.currentValue }))
      ),
    [fundValued]
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
  const alphaVsSpy = totalReturnPct - spyReturnPct;

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

  const comparisonSeries: ComparisonSeries[] = useMemo(
    () => [
      { label: "Margus", color: SERIES_COLOR.margus, points: margusReturnSeries },
      { label: "SPY", color: SERIES_COLOR.spy, points: spyReturnSeries },
    ],
    [margusReturnSeries, spyReturnSeries]
  );

  const fetchMyPortfolios = useCallback(async (): Promise<{
    portfolios: MyPortfolioMeta[];
    holdingsList: MyHolding[];
  }> => {
    const res = await fetch("/api/portfolios", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Failed to load your sheets");
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
    ): Promise<{ live: number; atPreviousClose: number }> => {
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
        const res = await fetch(
          quotesUrl(tickers),
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`Quotes fetch failed (${res.status})`);
        const data = await res.json();
        liveQuotes = data.quotes ?? {};
      }
      return {
        live: portfolioLiveValue(meta, holdingsList, liveQuotes),
        atPreviousClose: portfolioValueAtPreviousClose(
          meta,
          holdingsList,
          liveQuotes
        ),
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
        saveStoredBenchmark(null);
        return;
      }
      const { live, atPreviousClose } = await valueForPortfolio(
        benchmark.portfolioId,
        portfolios,
        holdingsList
      );
      setBenchmarkLiveValue(live);

      // Self-heal a benchmark set up earlier today: it originally anchored
      // to "value at the exact moment you clicked set benchmark", which
      // reads as ~0% dead-even for hours after a real intraday move
      // (Margus's side has the same issue, anchored to "current totalValue
      // right then" instead of his own start-of-day report). Re-anchor
      // both sides to today's open once, so the comparison actually
      // reflects the day instead of just "since I opened this page".
      if (benchmark.baselineDate === todayDateKey()) {
        const healedMargusBaseline =
          latestReportRef.current?.portfolio_value ??
          benchmark.margusBaselineValue;
        const needsHeal =
          Math.abs(benchmark.userBaselineValue - atPreviousClose) > 0.01 ||
          Math.abs(benchmark.margusBaselineValue - healedMargusBaseline) >
            0.01;
        if (needsHeal) {
          const healed: MyPortfolioBenchmark = {
            ...benchmark,
            userBaselineValue: atPreviousClose,
            margusBaselineValue: healedMargusBaseline,
          };
          saveStoredBenchmark(healed);
          setBenchmark(healed);
        }
      }
    } catch {
      /* keep last-known value on transient failure, non-critical */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchmark]);

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
        marketSession() === "closed" ? CLOSED_POLL_MS : QUOTE_POLL_MS
      );
    }
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
        setBenchmarkError(e instanceof Error ? e.message : "Failed to load your sheets");
      }
    }
  }, [myPortfolios, fetchMyPortfolios]);

  const handleSetBenchmark = useCallback(async () => {
    if (!pickerSelection || !myPortfolios) return;
    setBenchmarkBusy(true);
    setBenchmarkError(null);
    try {
      const meta = myPortfolios.find((p) => p.id === pickerSelection);
      if (!meta) throw new Error("Sheet not found");
      const { live, atPreviousClose } = await valueForPortfolio(
        pickerSelection,
        myPortfolios,
        myHoldings
      );
      const next: MyPortfolioBenchmark = {
        portfolioId: pickerSelection,
        portfolioName: meta.name,
        baselineDate: todayDateKey(),
        // Anchor to today's open, not "right now" — otherwise a benchmark
        // set up mid-day reads ~0% for hours even on a big move day.
        userBaselineValue: atPreviousClose,
        margusBaselineValue: latestReport?.portfolio_value ?? totalValue,
      };
      saveStoredBenchmark(next);
      setBenchmark(next);
      setBenchmarkLiveValue(live);
      setPickerOpen(false);
    } catch (e) {
      setBenchmarkError(e instanceof Error ? e.message : "Failed to set benchmark");
    } finally {
      setBenchmarkBusy(false);
    }
  }, [
    pickerSelection,
    myPortfolios,
    myHoldings,
    valueForPortfolio,
    totalValue,
    latestReport,
  ]);

  const handleClearBenchmark = useCallback(() => {
    saveStoredBenchmark(null);
    setBenchmark(null);
    setBenchmarkLiveValue(null);
    setPickerSelection("");
  }, []);

  const benchmarkCompare = useMemo(() => {
    if (!benchmark || benchmarkLiveValue == null) return null;
    const youPct =
      benchmark.userBaselineValue > 0
        ? (benchmarkLiveValue - benchmark.userBaselineValue) / benchmark.userBaselineValue
        : 0;
    const margusPct =
      benchmark.margusBaselineValue > 0
        ? (totalValue - benchmark.margusBaselineValue) / benchmark.margusBaselineValue
        : 0;
    return { youPct, margusPct, deltaPts: margusPct - youPct };
  }, [benchmark, benchmarkLiveValue, totalValue]);

  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_#1f1a12_0%,_#121214_55%)] text-zinc-100">
      <AppHeader title="Upside Fund" />

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-mid/40 bg-brand/15 text-brand-bright">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                Upside Fund
              </h1>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 text-xs tabular-nums text-zinc-400"
                  title={`Prices refresh every ${QUOTE_POLL_MS / 1000}s while the market is open, and slowly after the close`}
                >
                  {quotesAt != null && (
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
                    />
                  )}
                  {freshnessLabel(quotesAt, nowMs)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void load("manual");
                    void refreshBenchmarkValue();
                  }}
                  disabled={refreshing}
                  className="touch-target inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                  Refresh
                </button>
              </div>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              Paper money Margus trades in public. One decision a day, every
              trade with a thesis, a timeline, and an exit plan. Watch it,
              don&apos;t copy it.
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">
              Day {dayNumber} · started {fund ? fmtDate(fund.inception_date) : "—"}
            </p>
          </div>
        </div>

        <p className="rounded-xl border border-amber-500/25 bg-amber-950/15 px-3.5 py-2.5 text-xs leading-relaxed text-amber-200/90">
          {UPSIDE_PORTFOLIO_DISCLAIMER}
        </p>

        {loading ? (
          <p className="text-sm text-zinc-400">{loadingMessage}</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <>
            <section className="rounded-2xl border border-brand-deep/30 bg-[#161618]/70 p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-400">
                    Total value
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-white sm:text-xl">
                    {currency(totalValue, 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-400">
                    Today
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-lg font-semibold tabular-nums sm:text-xl",
                      signedTone(todayDollar, "text-white")
                    )}
                  >
                    {signedCurrency(todayDollar)}
                  </p>
                  {todayPct != null && (
                    <p
                      className={cn(
                        "text-xs tabular-nums",
                        signedTone(todayPct, "text-zinc-400")
                      )}
                    >
                      {percent(todayPct)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-400">
                    Total return
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-lg font-semibold tabular-nums sm:text-xl",
                      totalReturnDollar > 0
                        ? "text-gain"
                        : totalReturnDollar < 0
                          ? "text-loss"
                          : "text-white"
                    )}
                  >
                    {percent(totalReturnPct)}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {signedCurrency(totalReturnDollar)} ·{" "}
                    <span className={alphaVsSpy >= 0 ? "text-gain" : "text-loss"}>
                      {alphaVsSpy >= 0 ? "+" : ""}
                      {(alphaVsSpy * 100).toFixed(1)}pt vs SPY
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-zinc-400">
                    Cash
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-white sm:text-xl">
                    {currency(cash, 0)}
                  </p>
                  <p className="text-xs text-zinc-400">
                    of {currency(fund?.starting_capital ?? 0, 0)} start
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-brand-deep/30 bg-[#161618]/70 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  <Scale className="h-3.5 w-3.5" />
                  Margus vs SPY
                </h2>
              </div>
              <ComparisonChart series={comparisonSeries} height={160} />

              <div className="border-t border-zinc-800/80 pt-3">
                {!benchmark ? (
                  pickerOpen ? (
                    <div className="space-y-2">
                      {myPortfolios === null ? (
                        <p className="text-xs text-zinc-400">Loading your sheets …</p>
                      ) : myPortfolios.length === 0 ? (
                        <p className="text-xs text-zinc-400">
                          You don&apos;t have any sheets to compare yet.
                        </p>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="relative">
                            <select
                              value={pickerSelection}
                              onChange={(e) => setPickerSelection(e.target.value)}
                              className="touch-target appearance-none rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 pr-8 text-xs text-zinc-200 focus:border-brand-mid focus:outline-none"
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
                            className="touch-target rounded-md bg-brand/20 px-3 py-1.5 text-xs font-semibold text-brand-bright hover:bg-brand/30 disabled:opacity-50"
                          >
                            {benchmarkBusy ? "Setting …" : "Set as benchmark"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPickerOpen(false)}
                            className="touch-target rounded-md px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-300"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                      {benchmarkError && (
                        <p className="text-xs text-red-400">{benchmarkError}</p>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleOpenPicker()}
                      className="touch-target flex items-center text-xs font-semibold text-brand-bright hover:underline"
                    >
                      + Compare against your own portfolio
                    </button>
                  )
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-zinc-400">
                        <span className="font-semibold text-zinc-200">
                          {benchmark.portfolioName}
                        </span>{" "}
                        vs Margus, since {fmtDate(benchmark.baselineDate)}
                      </p>
                      <button
                        type="button"
                        onClick={handleClearBenchmark}
                        className="touch-target flex shrink-0 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-300"
                        aria-label="Remove benchmark"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {benchmarkCompare ? (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span>
                          <span style={{ color: SERIES_COLOR.you }}>●</span> You:{" "}
                          <span
                            className={cn(
                              "font-semibold tabular-nums",
                              benchmarkCompare.youPct >= 0 ? "text-gain" : "text-loss"
                            )}
                          >
                            {percent(benchmarkCompare.youPct)}
                          </span>
                        </span>
                        <span>
                          <span style={{ color: SERIES_COLOR.margus }}>●</span> Margus (same
                          window):{" "}
                          <span
                            className={cn(
                              "font-semibold tabular-nums",
                              benchmarkCompare.margusPct >= 0 ? "text-gain" : "text-loss"
                            )}
                          >
                            {percent(benchmarkCompare.margusPct)}
                          </span>
                        </span>
                        <span className="font-semibold text-zinc-300">
                          {Math.abs(benchmarkCompare.deltaPts) < 0.001
                            ? "Dead even"
                            : benchmarkCompare.deltaPts > 0
                              ? `Margus is ahead by ${(benchmarkCompare.deltaPts * 100).toFixed(1)}pt`
                              : `You're ahead by ${(Math.abs(benchmarkCompare.deltaPts) * 100).toFixed(1)}pt`}
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400">Calculating …</p>
                    )}
                  </div>
                )}
              </div>
            </section>

            {fundThemes.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  What he&apos;s betting on
                </h2>
                <div className="rounded-2xl border border-brand-deep/30 bg-[#161618]/70 p-4">
                  <div className="flex h-3 overflow-hidden rounded-full bg-zinc-900">
                    {fundThemes.map((t) => (
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
                    {fundThemes.map((t) => (
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
                      hint="Dry powder he's holding back"
                    />
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
                    return (
                      <div
                        key={h.id}
                        className="space-y-2 rounded-xl border border-brand-deep/30 bg-[#161618]/70 p-3.5"
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
                        <p className="text-xs text-zinc-400">
                          {currency(marketValue, 0)} · entered {fmtDate(h.entry_date)} at{" "}
                          {currency(h.cost_basis)}, now {currency(price)}
                        </p>
                        <p className="text-xs leading-relaxed text-zinc-400">
                          {h.thesis}
                        </p>
                        <div className="flex flex-wrap gap-1.5 text-xs text-zinc-400">
                          {h.target_timeframe && (
                            <span className="rounded-md bg-zinc-800/80 px-1.5 py-0.5">
                              Timeline: {h.target_timeframe}
                            </span>
                          )}
                          {h.exit_plan && (
                            <span className="rounded-md bg-zinc-800/80 px-1.5 py-0.5">
                              Exit: {h.exit_plan}
                            </span>
                          )}
                        </div>
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
                      <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-300">
                        {humanizeMargusText(r.body)}
                      </p>
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
                <p className="rounded-2xl border border-brand-deep/30 bg-[#161618]/70 px-4 py-6 text-center text-sm text-zinc-400">
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
                        className="space-y-2 rounded-2xl border border-brand-deep/30 bg-[#161618]/70 p-4"
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
                        className="group overflow-hidden rounded-2xl border border-zinc-800 bg-[#161618]/40"
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
                <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-brand-deep/30 bg-[#161618]/70">
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
