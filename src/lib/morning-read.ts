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

export type CloseNote = {
  book: string;
  loud: string;
  pulse: string;
};

export type SundayRecap = {
  headline: string;
  lines: string[];
};

export type MorningRead = {
  quiet: boolean;
  sentence: string;
  pulseFlag: MorningPulseFlag | null;
  awayLines: VisitDiff["lines"];
  drivers: MorningDriver[];
  closeNote: CloseNote | null;
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
      ? `${dollars} on the book. ${cashtag(loud)} is making the noise.`
      : `${dollars} on the book. Check if the story changed.`,
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

function pulseLineForTicker(ticker: string): string {
  const cached = loadPulseTickerCache(ticker);
  if (!cached?.check) {
    return `No Pulse on ${cashtag(ticker)} yet.`;
  }
  const status = cached.check.thesisStatus;
  if (status === "intact") {
    return `Last Pulse on ${cashtag(ticker)} is intact.`;
  }
  return `Last Pulse on ${cashtag(ticker)}: ${statusLabel(status).toLowerCase()}.`;
}

export function buildCloseNote(model: OverviewModel): CloseNote | null {
  if (model.tickers.length === 0 || model.totals.todayPct == null) return null;
  const loud = loudestName(model);
  return {
    book: `${signedCurrency(model.totals.todayDollar, 0)} on the book.`,
    loud: loud
      ? `${cashtag(loud)} was the name that did it.`
      : "No single name stood out.",
    pulse: loud ? pulseLineForTicker(loud) : "Pulse is quiet.",
  };
}

function signedPct(pct: number): string {
  const n = `${(Math.abs(pct) * 100).toFixed(1)}%`;
  if (pct > 0) return `+${n}`;
  if (pct < 0) return `-${n}`;
  return n;
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
  const flag = pulseFlagFor(model);
  const lines = [
    `Book $${Math.round(model.totals.totalValue).toLocaleString("en-US")}.`,
    bestTicker && bestPct != null
      ? `Biggest gainer: ${cashtag(bestTicker)} ${signedPct(bestPct)}.`
      : null,
    worstTicker &&
    worstPct != null &&
    worstTicker !== bestTicker
      ? `Biggest drop: ${cashtag(worstTicker)} ${signedPct(worstPct)}.`
      : null,
    week.days.length >= 2
      ? `You opened the book ${week.days.length} days this week.`
      : null,
    flag
      ? `Pulse: ${cashtag(flag.ticker)} ${statusLabel(flag.status).toLowerCase()}.`
      : bestTicker
        ? pulseLineForTicker(bestTicker)
        : null,
  ].filter((x): x is string => Boolean(x));
  return {
    headline: "Sunday look",
    lines,
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
  return {
    quiet: quiet && awayLines.length === 0,
    sentence,
    pulseFlag: pulseFlagFor(model),
    awayLines,
    drivers: sunday || afterClose ? [] : driversFor(model),
    closeNote: !sunday && afterClose ? buildCloseNote(model) : null,
    sunday,
  };
}
