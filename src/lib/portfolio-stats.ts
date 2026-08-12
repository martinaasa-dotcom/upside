import { allocationBySector, allocationByTicker } from "@/lib/allocation";
import { trailingIncome, type CashflowEntry } from "@/lib/cashflow";
import { correlationMatrix } from "@/lib/correlation";
import { buildDailyFunFacts } from "@/lib/fun-facts";
import type { OverviewModel, SheetScore, TickerScore } from "@/lib/overview";
import type { VisitStreakState } from "@/lib/visit-streak";

export type PortfolioStatTile = {
  label: string;
  value: string;
  hint?: string;
  tone?: "gain" | "loss" | "neutral" | "brand";
};

export type PortfolioInsight = {
  id: string;
  title: string;
  body: string;
  tag: "performance" | "structure" | "risk" | "fun" | "habit";
};

export type SheetStatRow = {
  id: string;
  name: string;
  navUsd: number;
  roiPct: number;
  todayPct: number | null;
  todayUsd: number;
  weightPct: number;
  holdings: number;
};

export type PortfolioStatsModel = {
  tiles: PortfolioStatTile[];
  insights: PortfolioInsight[];
  sheets: SheetStatRow[];
  topHoldings: Array<{ ticker: string; pct: number; valueUsd: number }>;
  topSectors: Array<{ label: string; pct: number }>;
  hasBook: boolean;
};

function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

function money(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function signedMoney(n: number): string {
  const prefix = n >= 0 ? "+" : "";
  return prefix + money(n);
}

function sparkVolatility(sparkline: number[]): number | null {
  if (sparkline.length < 5) return null;
  const rets: number[] = [];
  for (let i = 1; i < sparkline.length; i++) {
    const prev = sparkline[i - 1]!;
    const cur = sparkline[i]!;
    if (prev > 0) rets.push((cur - prev) / prev);
  }
  if (rets.length < 3) return null;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance =
    rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length;
  return Math.sqrt(variance);
}

function concentrationHhi(weights: number[]): number {
  return weights.reduce((s, w) => s + w * w, 0);
}

function buildStructureInsights(
  tickers: TickerScore[],
  totals: OverviewModel["totals"]
): PortfolioInsight[] {
  const out: PortfolioInsight[] = [];
  if (totals.totalValue <= 0 || !tickers.length) return out;

  const sorted = [...tickers].sort((a, b) => b.currentValue - a.currentValue);
  const top = sorted[0]!;
  const top3Share =
    sorted.slice(0, 3).reduce((s, t) => s + t.currentValue, 0) /
    Math.max(totals.equityValue, 1);
  const topShare = top.currentValue / Math.max(totals.equityValue, 1);
  const hhi = concentrationHhi(
    tickers.map((t) => t.currentValue / Math.max(totals.equityValue, 1))
  );

  out.push({
    id: "concentration",
    tag: "risk",
    title: `${top.ticker} is ${pct(topShare, 0)} of equity`,
    body:
      top3Share >= 0.7
        ? `Top 3 names are ${pct(top3Share, 0)} of the stack — high conviction, low diversification. HHI ${(hhi * 100).toFixed(0)}.`
        : `Top 3 names are ${pct(top3Share, 0)} of equity. Concentration index ${(hhi * 100).toFixed(0)} (lower = more spread).`,
  });

  const shared = tickers.filter((t) => t.portfolios.length >= 2);
  if (shared.length > 0) {
    const names = shared
      .sort((a, b) => b.currentValue - a.currentValue)
      .slice(0, 4)
      .map((t) => t.ticker)
      .join(", ");
    out.push({
      id: "overlap",
      tag: "structure",
      title: `${shared.length} ticker${shared.length === 1 ? "" : "s"} owned across multiple sheets`,
      body: `Family overlap: ${names}${shared.length > 4 ? "…" : ""}. Shared names move every book at once.`,
    });
  } else if (totals.sheetCount > 1) {
    out.push({
      id: "islands",
      tag: "structure",
      title: "Zero ticker overlap between sheets",
      body: "Each book is its own island — diversification by portfolio, not by name inside one book.",
    });
  }

  const cashShare = totals.cash / totals.totalValue;
  if (cashShare < 0) {
    out.push({
      id: "margin",
      tag: "risk",
      title: "Negative cash — margin in play",
      body: `${signedMoney(totals.cash)} across the books. Seasonal 'raise cash' signals assume you have dry powder to deploy.`,
    });
  } else if (cashShare >= 0.08) {
    out.push({
      id: "dry-powder",
      tag: "structure",
      title: `${pct(cashShare, 0)} of NAV is cash`,
      body: `${money(totals.cash)} ready to deploy when seasonality lines up with your entries.`,
    });
  } else if (cashShare < 0.03 && totals.cash >= 0) {
    out.push({
      id: "fully-in",
      tag: "structure",
      title: "Nearly fully invested",
      body: `Cash is only ${pct(cashShare, 0)} of NAV (${money(totals.cash)}). Trims need sells, not idle cash.`,
    });
  }

  return out;
}

function buildPerformanceInsights(tickers: TickerScore[]): PortfolioInsight[] {
  const out: PortfolioInsight[] = [];
  if (!tickers.length) return out;

  const best = [...tickers].sort((a, b) => b.roiPct - a.roiPct)[0];
  const worst = [...tickers].sort((a, b) => a.roiPct - b.roiPct)[0];
  if (best && best.roiPct > 0) {
    out.push({
      id: "mvp",
      tag: "performance",
      title: `Lifetime MVP: ${best.ticker}`,
      body: `${pct(best.roiPct)} ROI (${signedMoney(best.roiDollar)}) in ${best.portfolios.join(", ")}.`,
    });
  }
  if (worst && worst.roiPct < 0 && worst.ticker !== best?.ticker) {
    out.push({
      id: "laggard",
      tag: "performance",
      title: `Biggest drag: ${worst.ticker}`,
      body: `${pct(worst.roiPct)} ROI (${signedMoney(worst.roiDollar)}). Still in ${worst.portfolios.join(", ")}.`,
    });
  }

  const todayBest = [...tickers]
    .filter((t) => t.todayPct != null)
    .sort((a, b) => (b.todayPct ?? 0) - (a.todayPct ?? 0))[0];
  const todayWorst = [...tickers]
    .filter((t) => t.todayPct != null)
    .sort((a, b) => (a.todayPct ?? 0) - (b.todayPct ?? 0))[0];
  if (todayBest && (todayBest.todayPct ?? 0) !== 0) {
    out.push({
      id: "today-best",
      tag: "performance",
      title: `Today's leader: ${todayBest.ticker}`,
      body: `${pct(todayBest.todayPct!)} (${signedMoney(todayBest.todayDollar)}).`,
    });
  }
  if (
    todayWorst &&
    (todayWorst.todayPct ?? 0) < 0 &&
    todayWorst.ticker !== todayBest?.ticker
  ) {
    out.push({
      id: "today-worst",
      tag: "performance",
      title: `Today's laggard: ${todayWorst.ticker}`,
      body: `${pct(todayWorst.todayPct!)} (${signedMoney(todayWorst.todayDollar)}).`,
    });
  }

  return out;
}

function buildCorrelationInsight(tickers: TickerScore[]): PortfolioInsight | null {
  const withSpark = tickers.filter((t) => t.sparkline.length >= 8);
  if (withSpark.length < 2) return null;
  const cells = correlationMatrix(
    withSpark.map((t) => ({ ticker: t.ticker, sparkline: t.sparkline }))
  );
  if (!cells.length) return null;
  const tight = cells[0]!;
  const loose = cells[cells.length - 1]!;
  return {
    id: "correlation",
    tag: "risk",
    title: `${tight.a} & ${tight.b} move together`,
    body: `~${(tight.corr * 100).toFixed(0)}% correlated on recent prices. ${loose.a}/${loose.b} are the most independent pair (~${(loose.corr * 100).toFixed(0)}%).`,
  };
}

function buildVolatilityInsight(tickers: TickerScore[]): PortfolioInsight | null {
  const ranked = tickers
    .map((t) => ({ t, vol: sparkVolatility(t.sparkline) }))
    .filter((x): x is { t: TickerScore; vol: number } => x.vol != null)
    .sort((a, b) => b.vol - a.vol);
  if (!ranked.length) return null;
  const wild = ranked[0]!;
  const calm = ranked[ranked.length - 1]!;
  if (wild.t.ticker === calm.t.ticker) return null;
  return {
    id: "volatility",
    tag: "risk",
    title: `${wild.t.ticker} is the wildest ride`,
    body: `Highest recent swinginess in the book vs ${calm.t.ticker} on the calmer end — size positions accordingly.`,
  };
}

function buildSheetInsight(sheets: SheetScore[]): PortfolioInsight | null {
  if (sheets.length < 2) return null;
  const best = [...sheets].sort((a, b) => b.roiPct - a.roiPct)[0];
  const biggest = [...sheets].sort((a, b) => b.totalValue - a.totalValue)[0];
  if (!best || !biggest) return null;
  if (best.portfolio.id === biggest.portfolio.id) {
    return {
      id: "sheet-king",
      tag: "structure",
      title: `${biggest.portfolio.name} leads on size and ROI`,
      body: `${money(biggest.totalValue)} NAV · ${pct(biggest.roiPct)} lifetime ROI.`,
    };
  }
  return {
    id: "sheet-rivalry",
    tag: "fun",
    title: `${biggest.portfolio.name} is biggest, ${best.portfolio.name} wins ROI`,
    body: `${money(biggest.totalValue)} vs ${pct(best.roiPct)} on ${best.portfolio.name} — different superpowers.`,
  };
}

function buildIncomeInsight(cashflows: CashflowEntry[]): PortfolioInsight | null {
  const ytd = trailingIncome(cashflows, 365);
  const premiums = cashflows
    .filter((e) => e.kind === "premium")
    .reduce((s, e) => s + e.amount, 0);
  const dividends = cashflows
    .filter((e) => e.kind === "dividend")
    .reduce((s, e) => s + e.amount, 0);
  if (ytd <= 0 && premiums <= 0 && dividends <= 0) return null;
  const parts: string[] = [];
  if (dividends > 0) parts.push(`${money(dividends)} dividends`);
  if (premiums > 0) parts.push(`${money(premiums)} call premium`);
  return {
    id: "income",
    tag: "performance",
    title: `${money(ytd)} logged income (12m)`,
    body: parts.length ? parts.join(" · ") + " in Lab cashflow." : "From Lab cashflow log.",
  };
}

function buildStreakInsight(streak: VisitStreakState | null): PortfolioInsight | null {
  if (!streak || streak.currentStreak < 2) return null;
  return {
    id: "streak",
    tag: "habit",
    title: `${streak.currentStreak}-day check-in streak`,
    body: `Longest run ${streak.longestStreak} days · ${streak.totalVisits} total visits on this device.`,
  };
}

export function buildPortfolioStats(input: {
  overview: OverviewModel;
  cashflows?: CashflowEntry[];
  visitStreak?: VisitStreakState | null;
}): PortfolioStatsModel {
  const { overview, cashflows = [], visitStreak = null } = input;
  const { totals, sheets, tickers } = overview;

  if (!sheets.length || totals.totalValue <= 0) {
    return {
      tiles: [],
      insights: [],
      sheets: [],
      topHoldings: [],
      topSectors: [],
      hasBook: false,
    };
  }

  const todayTone: PortfolioStatTile["tone"] =
    totals.todayDollar > 0
      ? "gain"
      : totals.todayDollar < 0
        ? "loss"
        : "neutral";
  const roiTone: PortfolioStatTile["tone"] =
    totals.roiDollar > 0 ? "gain" : totals.roiDollar < 0 ? "loss" : "neutral";

  const tiles: PortfolioStatTile[] = [
    {
      label: "Combined NAV",
      value: money(totals.totalValue),
      hint: `${totals.sheetCount} sheet${totals.sheetCount === 1 ? "" : "s"} · ${totals.uniqueTickers} tickers`,
      tone: "brand",
    },
    {
      label: "Lifetime ROI",
      value: pct(totals.roiPct),
      hint: signedMoney(totals.roiDollar),
      tone: roiTone,
    },
    {
      label: "Today",
      value:
        totals.todayPct != null
          ? `${signedMoney(totals.todayDollar)} (${pct(totals.todayPct)})`
          : signedMoney(totals.todayDollar),
      hint: "Across all books",
      tone: todayTone,
    },
    {
      label: "Cash",
      value: money(totals.cash),
      hint: `${pct(totals.cash / totals.totalValue, 0)} of NAV`,
      tone: totals.cash < 0 ? "loss" : "neutral",
    },
  ];

  const holdingRows = tickers.map((t) => ({
    ticker: t.ticker,
    currentValue: t.currentValue,
  }));
  const topHoldings = allocationByTicker(holdingRows, 6)
    .filter((s) => s.key !== "other")
    .map((s) => ({
      ticker: s.label,
      pct: s.pct,
      valueUsd: s.value,
    }));
  const topSectors = allocationBySector(holdingRows)
    .slice(0, 5)
    .map((s) => ({ label: s.label, pct: s.pct }));

  const sheetRows: SheetStatRow[] = sheets.map((s) => ({
    id: s.portfolio.id,
    name: s.portfolio.name,
    navUsd: s.totalValue,
    roiPct: s.roiPct,
    todayPct: s.todayPct,
    todayUsd: s.todayDollar,
    weightPct: totals.totalValue > 0 ? s.totalValue / totals.totalValue : 0,
    holdings: s.holdingCount,
  }));

  const insights: PortfolioInsight[] = [
    ...buildPerformanceInsights(tickers),
    ...buildStructureInsights(tickers, totals),
    buildCorrelationInsight(tickers),
    buildVolatilityInsight(tickers),
    buildSheetInsight(sheets),
    buildIncomeInsight(cashflows),
    buildStreakInsight(visitStreak),
  ].filter((x): x is PortfolioInsight => x != null);

  const funFacts = buildDailyFunFacts(sheets, tickers, totals).slice(0, 3);
  for (let i = 0; i < funFacts.length; i++) {
    insights.push({
      id: `fun-${i}`,
      tag: "fun",
      title: "Book lore",
      body: funFacts[i]!,
    });
  }

  return {
    tiles,
    insights: insights.slice(0, 12),
    sheets: sheetRows.sort((a, b) => b.navUsd - a.navUsd),
    topHoldings,
    topSectors,
    hasBook: true,
  };
}
