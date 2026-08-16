import { buildBookInsights } from "@/lib/book-insights";
import { cashtag, signedCurrency } from "@/lib/format";
import {
  insightWhen,
  isUsAfterCashClose,
  isUsWeekend,
  type SessionKind,
} from "@/lib/market-session";
import type { OverviewModel } from "@/lib/overview";
import type { VisitDiff } from "@/lib/visit-diff";
import { loadWeekMarks } from "@/lib/week-marks";
import {
  loadPulseTickerCache,
  reconcilePulseCheck,
  statusLabel,
  type PulseCheck,
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
};

export type MorningNotice = {
  label: string;
  text: string;
};

export type MorningRead = {
  quiet: boolean;
  sentence: string;
  notices: MorningNotice[];
  pulseFlags: MorningPulseFlag[];
  awayLines: VisitDiff["lines"];
  drivers: MorningDriver[];
  afterClose: boolean;
  sunday: SundayRecap | null;
  moveLabel: "Today" | "Friday";
};

function daySentence(
  model: OverviewModel,
  weekend: boolean
): { quiet: boolean; sentence: string } {
  if (weekend) {
    return {
      quiet: true,
      sentence: "US markets are closed. These are Friday's numbers.",
    };
  }
  const pct = model.totals.todayPct;
  if (pct == null) {
    return { quiet: true, sentence: "Prices are still coming in." };
  }
  const dollars = signedCurrency(model.totals.todayDollar, 0);
  const swing = Math.abs(pct);
  if (swing < 0.005) {
    return { quiet: true, sentence: "Quiet day. Your portfolio barely moved." };
  }
  if (swing < 0.02) {
    return {
      quiet: true,
      sentence: `Small move, ${dollars}. Nothing you have to do.`,
    };
  }
  return {
    quiet: false,
    sentence: "A few holdings moved the whole number. Who is listed below.",
  };
}

export function pulseFlagsFromChecks(
  tickers: Array<{ ticker: string; todayPct: number | null }>,
  checks: Record<string, PulseCheck | undefined>
): MorningPulseFlag[] {
  const ranked = [...tickers].sort(
    (a, b) => Math.abs(b.todayPct ?? 0) - Math.abs(a.todayPct ?? 0)
  );
  const flags: MorningPulseFlag[] = [];
  const seen = new Set<string>();
  for (const t of ranked) {
    const key = t.ticker.trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    const raw = checks[key];
    if (!raw) continue;
    const check = reconcilePulseCheck(raw);
    if (check.thesisStatus === "intact") continue;
    seen.add(key);
    const line =
      check.verdict?.trim() ||
      check.moveReason?.trim() ||
      check.thesisBreak?.trim() ||
      `${statusLabel(check.thesisStatus)} on ${cashtag(key)}.`;
    flags.push({
      ticker: key,
      status: check.thesisStatus,
      line,
    });
  }
  return flags;
}

function pulseFlagsFor(model: OverviewModel): MorningPulseFlag[] {
  const checks: Record<string, PulseCheck | undefined> = {};
  for (const t of model.tickers) {
    const cached = loadPulseTickerCache(t.ticker);
    if (cached?.check) checks[t.ticker.toUpperCase()] = cached.check;
  }
  return pulseFlagsFromChecks(
    model.tickers.map((t) => ({ ticker: t.ticker, todayPct: t.todayPct })),
    checks
  );
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
  const weekend = isUsWeekend();
  const when = insightWhen(session);
  const { quiet, sentence } = daySentence(model, weekend);
  const awayLines = visitDiff?.lines.slice(0, 3) ?? [];
  const sunday = isSundayTallinn() ? buildSundayRecap(model) : null;
  const afterClose = isUsAfterCashClose(session);
  const insights = buildBookInsights(
    model.tickers.map((t) => ({
      ticker: t.ticker,
      value: t.currentValue,
      todayPct: t.todayPct,
    })),
    when
  );
  const notices: MorningNotice[] = [];
  if (insights.rotation) {
    notices.push({
      label: when === "friday" ? "Friday's close" : "Worth noticing",
      text: insights.rotation,
    });
  }
  if (insights.idea) {
    notices.push({ label: "What's missing", text: insights.idea });
  }
  return {
    quiet: quiet && awayLines.length === 0,
    sentence,
    notices,
    pulseFlags: pulseFlagsFor(model),
    awayLines,
    drivers: sunday ? [] : driversFor(model),
    afterClose: !sunday && afterClose,
    sunday,
    moveLabel: when === "friday" ? "Friday" : "Today",
  };
}
