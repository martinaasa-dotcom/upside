/**
 * Book-level ideas and rotation reads. Theme sleeves only, never a
 * hardcoded ticker list. Used by Margus, emails, Pulse, Forecast, and Home.
 */

import { themeBreakdown } from "@/lib/allocation";
import {
  forecastThemeForTicker,
  type ForecastTheme,
} from "@/lib/forecast-conviction";
import { THEME_LABEL } from "@/lib/portfolio-personality";

export type InsightHolding = {
  ticker: string;
  value: number;
  todayPct?: number | null;
};

export type BookInsights = {
  idea: string | null;
  rotation: string | null;
  lines: string[];
  promptBlock: string;
};

const GAP = 0.08;

/** Next sleeve that usually sits next to a dominant theme. No tickers. */
const NEXT_SLEEVE: Partial<
  Record<ForecastTheme, { need: ForecastTheme; line: string }[]>
> = {
  ai_infra: [
    {
      need: "ai_power",
      line: "This book is the compute side. Power and grid names are the usual next sleeve if the story is data centers.",
    },
    {
      need: "semi",
      line: "The picks are the cloud layer. Chip names are how this theme usually sits next door.",
    },
  ],
  ai_power: [
    {
      need: "ai_infra",
      line: "You're on the electricity side. GPU cloud names are the other half of the same buildout.",
    },
  ],
  crypto: [
    {
      need: "index",
      line: "Crypto is most of the diet. A broad index sleeve is how people usually keep a winter from being the only story.",
    },
  ],
  space: [
    {
      need: "index",
      line: "Space is a cadence story. A calmer sleeve next to it keeps one delay from being the whole year.",
    },
  ],
  semi: [
    {
      need: "ai_infra",
      line: "The chips are in. The cloud names that buy those chips are the usual next sleeve.",
    },
  ],
  software: [
    {
      need: "semi",
      line: "This book is software. The hardware underneath it is the usual missing piece when the theme runs hot.",
    },
  ],
  drones: [
    {
      need: "software",
      line: "Defense and drones are the bet. A software or sensor name is how that theme usually sits next door.",
    },
  ],
  fintech: [
    {
      need: "index",
      line: "Fintech is rate-sensitive. A broader sleeve next to it keeps one credit cycle from being the whole book.",
    },
  ],
};

function themePct(
  slices: ReturnType<typeof themeBreakdown>,
  theme: ForecastTheme
): number {
  return slices.find((s) => s.theme === theme)?.pct ?? 0;
}

function ideaFor(
  slices: ReturnType<typeof themeBreakdown>
): string | null {
  const top = slices[0];
  if (!top || top.pct < 0.35) return null;
  const options = NEXT_SLEEVE[top.theme] ?? [];
  for (const opt of options) {
    if (themePct(slices, opt.need) < GAP) return opt.line;
  }
  return null;
}

function structuralRotation(
  slices: ReturnType<typeof themeBreakdown>
): string | null {
  const top = slices[0];
  if (!top || top.pct < 0.55) return null;
  const label = THEME_LABEL[top.theme];
  return `Most of this book is ${label}. A rotation away from that theme hits the whole sheet, not one name.`;
}

function dayRotation(holdings: InsightHolding[]): string | null {
  const withMove = holdings.filter(
    (h) => h.value > 0 && h.todayPct != null && Number.isFinite(h.todayPct)
  );
  if (withMove.length < 2) return null;

  const byTheme = new Map<ForecastTheme, { value: number; dollar: number }>();
  let total = 0;
  for (const h of withMove) {
    const theme = forecastThemeForTicker(h.ticker);
    const prev = byTheme.get(theme) ?? { value: 0, dollar: 0 };
    prev.value += h.value;
    prev.dollar += h.value * (h.todayPct as number);
    byTheme.set(theme, prev);
    total += h.value;
  }
  if (total <= 0 || byTheme.size < 2) return null;

  const ranked = [...byTheme.entries()]
    .map(([theme, v]) => ({
      theme,
      weight: v.value / total,
      pct: v.value !== 0 ? v.dollar / v.value : 0,
    }))
    .filter((t) => t.weight >= 0.15)
    .sort((a, b) => b.pct - a.pct);
  if (ranked.length < 2) return null;

  const best = ranked[0]!;
  const worst = ranked[ranked.length - 1]!;
  if (best.theme === worst.theme) return null;
  if (best.pct - worst.pct < 0.03) return null;
  if (best.pct <= 0 && worst.pct >= 0) return null;

  return `Today the money is leaving ${THEME_LABEL[worst.theme]} and showing up in ${THEME_LABEL[best.theme]}. If you didn't mean to take that bet, this is the day to notice.`;
}

export function buildBookInsights(holdings: InsightHolding[]): BookInsights {
  const slices = themeBreakdown(
    holdings.map((h) => ({ ticker: h.ticker, currentValue: h.value }))
  );
  const idea = ideaFor(slices);
  const rotation = dayRotation(holdings) ?? structuralRotation(slices);
  const lines = [rotation, idea].filter((x): x is string => Boolean(x));
  const promptBlock =
    lines.length === 0
      ? ""
      : `Book insights (use when relevant, do not force into every reply):
${lines.map((l) => `- ${l}`).join("\n")}
Talk in sleeves and themes, not a shopping list of new tickers, unless the user asks for names. Educational scenario, not an order to buy.`;

  return { idea, rotation, lines, promptBlock };
}

export function insightsPromptBlock(holdings: InsightHolding[]): string {
  return buildBookInsights(holdings).promptBlock;
}
