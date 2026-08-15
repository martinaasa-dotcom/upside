import { cashtag, signedCurrency } from "@/lib/format";
import type { OverviewModel } from "@/lib/overview";
import type { VisitDiff } from "@/lib/visit-diff";
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

export type MorningRead = {
  quiet: boolean;
  sentence: string;
  pulseFlag: MorningPulseFlag | null;
  awayLines: VisitDiff["lines"];
  drivers: MorningDriver[];
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

/** One screen of Today, no new model call. Uses live book + cached Pulse. */
export function buildMorningRead(
  model: OverviewModel,
  visitDiff: VisitDiff | null
): MorningRead {
  const { quiet, sentence } = daySentence(model);
  const awayLines = visitDiff?.lines.slice(0, 3) ?? [];
  return {
    quiet: quiet && awayLines.length === 0,
    sentence,
    pulseFlag: pulseFlagFor(model),
    awayLines,
    drivers: driversFor(model),
  };
}
