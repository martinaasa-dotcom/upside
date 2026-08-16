/**
 * Book-level ideas and "money is moving" reads. Groups of similar
 * businesses only, never a hardcoded ticker list. Used by Margus, emails,
 * Pulse, Forecast, and Home.
 */

import { themeBreakdown } from "@/lib/allocation";
import { cashtag } from "@/lib/format";
import {
  forecastThemeForTicker,
  type ForecastTheme,
} from "@/lib/forecast-conviction";
import { THEME_LABEL } from "@/lib/portfolio-personality";

/** Kitchen-table names for the day-move sentence. Charts keep THEME_LABEL. */
const THEME_PLAIN: Record<ForecastTheme, string> = {
  ai_infra: "companies that build or rent AI computers",
  ai_power: "power companies that feed data centers",
  crypto: "crypto names",
  space: "space names",
  semi: "chip makers",
  fintech: "money-app names",
  software: "software names",
  healthcare: "healthcare names",
  drones: "defense and drone names",
  index: "broad market funds",
  other: "the rest of your portfolio",
};

const AI_NEIGHBORS = new Set<ForecastTheme>([
  "semi",
  "ai_infra",
  "ai_power",
  "software",
]);

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

/** Next group that usually sits next to a dominant theme. No tickers. */
const NEXT_GROUP: Partial<
  Record<ForecastTheme, { need: ForecastTheme; line: string }[]>
> = {
  ai_infra: [
    {
      need: "ai_power",
      line: "Your portfolio is mostly the computer side. Electricity and power-grid names usually sit next to that if the story is data centers.",
    },
    {
      need: "semi",
      line: "These picks are the cloud layer. Chip makers are the usual neighbor.",
    },
  ],
  ai_power: [
    {
      need: "ai_infra",
      line: "You're on the electricity side. Cloud computer names are the other half of the same build.",
    },
  ],
  crypto: [
    {
      need: "index",
      line: "Crypto is most of the mix. A fund that owns a bit of everything is how people usually keep a bad crypto year from being the only story.",
    },
  ],
  space: [
    {
      need: "index",
      line: "Space depends on launch dates. A calmer group next to it keeps one delay from being the whole year.",
    },
  ],
  semi: [
    {
      need: "ai_infra",
      line: "The chips are in. The cloud companies that buy those chips are the usual next group.",
    },
  ],
  software: [
    {
      need: "semi",
      line: "Your portfolio is software. The hardware underneath it is the usual missing piece when that group runs hot.",
    },
  ],
  drones: [
    {
      need: "software",
      line: "Defense and drones are the bet. A software or sensor name is how that group usually sits next door.",
    },
  ],
  fintech: [
    {
      need: "index",
      line: "Money-app names move when interest rates move. A broader mix next to them keeps one rate cycle from being the whole portfolio.",
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
  const options = NEXT_GROUP[top.theme] ?? [];
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
  return `Most of your portfolio is ${label}. If that group has a bad year, the whole portfolio feels it, not just one name.`;
}

function loudestInTheme(
  holdings: InsightHolding[],
  theme: ForecastTheme
): string | null {
  let best: InsightHolding | null = null;
  let bestAbs = 0;
  for (const h of holdings) {
    if (forecastThemeForTicker(h.ticker) !== theme) continue;
    const pct = h.todayPct;
    if (pct == null || !Number.isFinite(pct)) continue;
    const abs = Math.abs(pct);
    if (abs >= bestAbs) {
      bestAbs = abs;
      best = h;
    }
  }
  return best?.ticker ?? null;
}

function aboutPct(pct: number): string {
  const n = Math.max(1, Math.round(Math.abs(pct) * 100));
  if (pct > 0) return `up about ${n}%`;
  if (pct < 0) return `down about ${n}%`;
  return "about flat";
}

function groupLead(ticker: string | null, group: string): string {
  if (ticker) return `${cashtag(ticker)} and the other ${group}`;
  return group.charAt(0).toUpperCase() + group.slice(1);
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

  const down = groupLead(loudestInTheme(withMove, worst.theme), THEME_PLAIN[worst.theme]);
  const up = groupLead(loudestInTheme(withMove, best.theme), THEME_PLAIN[best.theme]);
  const closer =
    AI_NEIGHBORS.has(best.theme) && AI_NEIGHBORS.has(worst.theme)
      ? "Both sit in the AI story, but they are not the same bet."
      : "Those are two different parts of your portfolio. Today's prices treated them that way.";
  return `${down} are ${aboutPct(worst.pct)} today. ${up} are ${aboutPct(best.pct)}. ${closer}`;
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
      : `Portfolio insights (use when relevant, do not force into every reply):
${lines.map((l) => `- ${l}`).join("\n")}
Talk about groups of similar businesses, not a shopping list of new tickers, unless the user asks for names. Educational scenario, not an order to buy. Use plain words a grandma would get. Never say sleeve, marks, conviction, digestion, beta, or rotation. Thesis is fine.`;

  return { idea, rotation, lines, promptBlock };
}

export function insightsPromptBlock(holdings: InsightHolding[]): string {
  return buildBookInsights(holdings).promptBlock;
}
