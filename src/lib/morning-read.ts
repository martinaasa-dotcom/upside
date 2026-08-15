import { buildBookInsights } from "@/lib/book-insights";
import { cashtag, signedCurrency } from "@/lib/format";
import {
  isUsAfterCashClose,
  type SessionKind,
} from "@/lib/market-session";
import type { OverviewModel } from "@/lib/overview";
import type { VisitDiff } from "@/lib/visit-diff";
import { loadWeekMarks } from "@/lib/week-marks";
import {
  loadPulseTickerCache,
  statusLabel,
  type ThesisStatus,
} from "@/lib/thesis-pulse";

export type MorningPulseFlag = {
  ticker: string;
  status: ThesisStatus;
  line: string;
};

export type MorningDriver = {
  ticker: string;
  dollar: number;
  share: number | null;
};

export type SundayName = {
  ticker: string;
  pct: number;
};

export type SundayRecap = {
  best: SundayName | null;
  worst: SundayName | null;
  openedDays: number | null;
};

export type MorningRead = {
  quiet: boolean;
  sentence: string;
  insight: string | null;
  pulseFlag: MorningPulseFlag | null;
  awayLines: VisitDiff["lines"];
  drivers: MorningDriver[];
  afterClose: boolean;
  sunday: SundayRecap | null;
};

function loudestName(model: OverviewModel): string | null {
  const ranked = [...model.tickers].sort(
    (a, b) => Math.abs(b.todayDollar) - Math.abs(a.todayDollar)
  );
  return ranked[0]?.ticker ?? null;
}

function daySentence(model: OverviewModel): { quiet: boolean; sentence: string } {
  const pct = model.totals.todayPct;
  if (pct == null) {
    return { quiet: true, sentence: "Prices are still coming in." };
  }
  const dollars = signedCurrency(model.totals.todayDollar, 0);
  const loud = loudestName(model);
  const swing = Math.abs(pct);
  if (swing < 0.005) {
    return { quiet: true, sentence: "Quiet day. Book barely moved." };
  }
  if (swing < 0.02) {
    return {
      quiet: true,
      sentence: `Small move, ${dollars}. Nothing you have to do.`,
    };
  }
  return {
    quiet: false,
    sentence: loud
      ? `${cashtag(loud)} did most of today's move.`
      : "Check if the story changed.",
  };
}

function pulseFlagFor(model: OverviewModel): MorningPulseFlag | null {
  const ranked = [...model.tickers].sort(
    (a, b) => Math.abs(b.todayPct ?? 0) - Math.abs(a.todayPct ?? 0)
  );
  for (const t of ranked) {
    const cached = loadPulseTickerCache(t.ticker);
    if (!cached?.check) continue;
    const status = cached.check.thesisStatus;
    if (status === "intact" && Math.abs(t.todayPct ?? 0) < 0.03) continue;
    if (status === "intact") continue;
    const line =
      cached.check.verdict?.trim() ||
      cached.check.thesisBreak?.trim() ||
      `${statusLabel(status)}. ${cashtag(t.ticker)}`;
    return { ticker: t.ticker, status, line };
  }
  return null;
}

function driversFor(model: OverviewModel): MorningDriver[] {
  const swing = model.tickers.reduce(
    (s, t) => s + Math.abs(t.todayDollar),
    0
  );
  return [...model.tickers]
    .sort((a, b) => Math.abs(b.todayDollar) - Math.abs(a.todayDollar))
    .filter((t) => Math.abs(t.todayDollar) >= 1)
    .slice(0, 3)
    .map((t) => ({
      ticker: t.ticker,
      dollar: t.todayDollar,
      share: swing >= 50 ? Math.abs(t.todayDollar) / swing : null,
    }));
}

export function buildSundayRecap(model: OverviewModel): SundayRecap | null {
  if (model.tickers.length === 0) return null;
  const week = loadWeekMarks();
  const liveBest = [...model.tickers].sort(
    (a, b) => (b.todayPct ?? -99) - (a.todayPct ?? -99)
  )[0];
  const liveWorst = [...model.tickers].sort(
    (a, b) => (a.todayPct ?? 99) - (b.todayPct ?? 99)
  )[0];
  const weekBest = [...week.days]
    .filter((d) => d.bestTicker && d.bestPct != null)
    .sort((a, b) => (b.bestPct ?? -99) - (a.bestPct ?? -99))[0];
  const weekWorst = [...week.days]
    .filter((d) => d.worstTicker && d.worstPct != null)
    .sort((a, b) => (a.worstPct ?? 99) - (b.worstPct ?? 99))[0];
  const bestTicker = weekBest?.bestTicker ?? liveBest?.ticker ?? null;
  const bestPct = weekBest?.bestPct ?? liveBest?.todayPct ?? null;
  const worstTicker = weekWorst?.worstTicker ?? liveWorst?.ticker ?? null;
  const worstPct = weekWorst?.worstPct ?? liveWorst?.todayPct ?? null;
  const best =
    bestTicker && bestPct != null ? { ticker: bestTicker, pct: bestPct } : null;
  const worst =
    worstTicker && worstPct != null && worstTicker !== bestTicker
      ? { ticker: worstTicker, pct: worstPct }
      : null;
  return {
    best,
    worst,
    openedDays: week.days.length >= 2 ? week.days.length : null,
  };
}

function isSundayTallinn(now = new Date()): boolean {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Tallinn",
    weekday: "short",
  }).format(now);
  return wd === "Sun";
}

/** One screen of Today, no new model call. Uses live book + cached Pulse. */
export function buildMorningRead(
  model: OverviewModel,
  visitDiff: VisitDiff | null,
  session: SessionKind = "unknown"
): MorningRead {
  const { quiet, sentence } = daySentence(model);
  const awayLines = visitDiff?.lines.slice(0, 3) ?? [];
  const sunday = isSundayTallinn() ? buildSundayRecap(model) : null;
  const afterClose = isUsAfterCashClose(session);
  const insight =
    buildBookInsights(
      model.tickers.map((t) => ({
        ticker: t.ticker,
        value: t.currentValue,
        todayPct: t.todayPct,
      }))
    ).lines[0] ?? null;
  return {
    quiet: quiet && awayLines.length === 0,
    sentence,
    insight,
    pulseFlag: pulseFlagFor(model),
    awayLines,
    drivers: sunday ? [] : driversFor(model),
    afterClose: !sunday && afterClose,
    sunday,
  };
}
