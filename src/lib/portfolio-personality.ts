/**
 * Fun, non-serious personality scoring for comparing portfolios in
 * Communities — a diversification score, a risk score, and a "spirit
 * animal" derived from both plus the dominant sector theme. None of this
 * is investment analysis; it's a light, shareable way to compare books
 * at a glance ("who's the shark, who's the owl").
 */

import { forecastThemeForTicker, type ForecastTheme } from "@/lib/forecast-conviction";

/** Rough 0-100 risk/volatility read per theme — illustrative, not a
 * real risk model. Crypto and concentrated growth names score hot;
 * index funds and healthcare score calm. */
const THEME_RISK_SCORE: Record<ForecastTheme, number> = {
  crypto: 95,
  space: 85,
  ai_infra: 80,
  drones: 78,
  semi: 72,
  ai_power: 65,
  fintech: 60,
  software: 55,
  other: 50,
  healthcare: 35,
  index: 15,
};

export type PortfolioPersonality = {
  /** 0-100, higher = more spread out across positions. */
  diversificationScore: number;
  /** 0-100, higher = hotter/more volatile theme mix. */
  riskScore: number;
  dominantTheme: ForecastTheme;
  animal: string;
  animalEmoji: string;
  tagline: string;
};

const THEME_LABEL: Record<ForecastTheme, string> = {
  ai_infra: "AI infra",
  ai_power: "AI power",
  crypto: "crypto",
  space: "space",
  semi: "semis",
  fintech: "fintech",
  software: "software",
  healthcare: "healthcare",
  drones: "drones",
  index: "index funds",
  other: "a mixed bag",
};

/** Herfindahl-style concentration → 0-100 diversification score.
 * Equity positions only; cash isn't a "position" in the concentration
 * sense so it's excluded here (a note about cash % can live alongside). */
function diversificationScoreFromWeights(values: number[]): number {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0 || values.length === 0) return 0;
  const hhi = values.reduce((s, v) => {
    const w = Math.max(0, v) / total;
    return s + w * w;
  }, 0);
  return Math.max(0, Math.min(100, Math.round((1 - hhi) * 100)));
}

function pickAnimal(opts: {
  diversification: number;
  risk: number;
  theme: ForecastTheme;
  positionCount: number;
}): { animal: string; emoji: string; tagline: string } {
  const { diversification, risk, theme, positionCount } = opts;

  if (positionCount === 0) {
    return {
      animal: "Hatchling",
      emoji: "🥚",
      tagline: "All cash, no positions yet — every book starts here.",
    };
  }
  if (theme === "crypto" && risk >= 80) {
    return {
      animal: "Dragon",
      emoji: "🐉",
      tagline: "Hoards volatile treasure, breathes fire on rallies (and dips).",
    };
  }
  if (risk >= 75 && diversification < 40) {
    return {
      animal: "Shark",
      emoji: "🦈",
      tagline: "A few high-conviction bets, hunted with total focus.",
    };
  }
  if (risk >= 75 && diversification >= 40) {
    return {
      animal: "Wolf",
      emoji: "🐺",
      tagline: "Runs with a pack of aggressive names across several fronts.",
    };
  }
  if (diversification >= 75) {
    return {
      animal: "Elephant",
      emoji: "🐘",
      tagline: "Broad, steady, and hard to spook — never one bad day away from trouble.",
    };
  }
  if (risk < 35 && diversification < 40) {
    return {
      animal: "Turtle",
      emoji: "🐢",
      tagline: "A small, well-armored shell — slow and steady on purpose.",
    };
  }
  if (risk < 40) {
    return {
      animal: "Owl",
      emoji: "🦉",
      tagline: "Watchful and risk-aware, spread wide across the board.",
    };
  }
  if (positionCount <= 3) {
    return {
      animal: "Falcon",
      emoji: "🦅",
      tagline: "Small, sharp-eyed, and diving hard on very few targets.",
    };
  }
  return {
    animal: "Fox",
    emoji: "🦊",
    tagline: "Clever and adaptable — some offense, some defense, no dogma.",
  };
}

export function buildPortfolioPersonality(
  holdings: Array<{ ticker: string; value: number }>
): PortfolioPersonality {
  const positive = holdings.filter((h) => h.value > 0);
  const diversificationScore = diversificationScoreFromWeights(
    positive.map((h) => h.value)
  );

  const total = positive.reduce((s, h) => s + h.value, 0);
  let riskScore = 50;
  const themeWeights = new Map<ForecastTheme, number>();
  if (total > 0) {
    let weightedRisk = 0;
    for (const h of positive) {
      const theme = forecastThemeForTicker(h.ticker);
      const weight = h.value / total;
      weightedRisk += weight * (THEME_RISK_SCORE[theme] ?? 50);
      themeWeights.set(theme, (themeWeights.get(theme) ?? 0) + weight);
    }
    riskScore = Math.round(weightedRisk);
  }

  let dominantTheme: ForecastTheme = "other";
  let bestWeight = -1;
  for (const [theme, weight] of themeWeights) {
    if (weight > bestWeight) {
      bestWeight = weight;
      dominantTheme = theme;
    }
  }

  const { animal, emoji, tagline } = pickAnimal({
    diversification: diversificationScore,
    risk: riskScore,
    theme: dominantTheme,
    positionCount: positive.length,
  });

  return {
    diversificationScore,
    riskScore,
    dominantTheme,
    animal,
    animalEmoji: emoji,
    tagline: `${tagline} Mostly ${THEME_LABEL[dominantTheme]}.`,
  };
}
