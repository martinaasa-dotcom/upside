/**
 * Fun, non-serious personality scoring for comparing portfolios in
 * Communities — a diversification score, a risk score, a modeled return
 * profile, and a "spirit animal" derived from all of it. None of this is
 * investment analysis; it's a light, shareable way to compare books at a
 * glance ("who's the shark, who's the owl").
 */

import { forecastThemeForTicker, impliedAnnualReturnForTheme, type ForecastTheme } from "@/lib/forecast-conviction";

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

/** Illustrative worst-case peak-to-trough drawdown per theme — a rough,
 * directional "how far could this fall" read (loosely shaped by how these
 * sectors have actually drawn down historically), not a modeled forecast. */
const THEME_MAX_DRAWDOWN_PCT: Record<ForecastTheme, number> = {
  crypto: 75,
  space: 60,
  ai_infra: 55,
  drones: 55,
  semi: 50,
  ai_power: 45,
  fintech: 45,
  software: 42,
  other: 40,
  healthcare: 30,
  index: 22,
};

/** A broad index ticker (SPY, CSPX, a total-market fund…) is internally
 * diversified even though it's "one position" in a per-ticker weight
 * breakdown — let it count in the concentration math as if it were spread
 * across this many synthetic equal-weight slices. */
const INDEX_LOOKTHROUGH_SLOTS = 15;

/** Effective-position count (1 / HHI) needed to read as "fully
 * diversified" (100/100). A handful of single-stock bets — a common,
 * real setup — should read as concentrated, not "87% diversified"; it
 * should take something closer to a genuinely broad book to max out. */
const DIVERSIFICATION_CEILING_N = 20;

/** Long-run assumptions for the CAPM-style "modeled alpha" read below —
 * same spirit as the Compound sheet's cash-yield/index assumptions, just
 * local here to avoid a cross-import for two constants. */
const RISK_FREE_ANNUAL_PCT = 4.5;
const MARKET_ANNUAL_RETURN_PCT = 10;
/** Risk score that maps to beta = 1.0 (an "average" book, theme "other"). */
const BETA_NEUTRAL_RISK_SCORE = 50;

export type ScoreBand = { label: string; description: string };

export type PortfolioPersonality = {
  /** 0-100, higher = more spread across effectively-independent positions. */
  diversificationScore: number;
  diversificationBand: ScoreBand;
  /** 0-100, higher = hotter/more volatile theme mix. */
  riskScore: number;
  riskBand: ScoreBand;
  dominantTheme: ForecastTheme;
  animal: string;
  animalEmoji: string;
  tagline: string;
  /** Blended forward-looking annual return of the actual picks (equity
   * only), from the same engine Forecast uses — a modeled expectation,
   * not a promise. */
  expectedAnnualReturnPct: number;
  /** Blended illustrative worst-case drawdown across the held themes. */
  maxDrawdownPct: number;
  /**
   * "Modeled alpha" — a playful, CAPM-inspired number: this book's own
   * blended forward-return model minus what a passive index bet carrying
   * the *same* risk (beta, proxied from the risk score) would need to earn
   * under long-run market assumptions. Positive = the actual stock
   * selection is modeled to earn more than its risk level alone would
   * "deserve"; negative = the picks are modeled to earn less than a
   * same-risk index bet. Not a real backtested Jensen's alpha — a fun,
   * directional read using the forecast engine's own return assumptions.
   */
  modeledAlphaPct: number;
};

export const THEME_LABEL: Record<ForecastTheme, string> = {
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

function diversificationBandFor(score: number): ScoreBand {
  if (score < 25)
    return {
      label: "Concentrated",
      description: "A handful of names carry most of the book.",
    };
  if (score < 50)
    return {
      label: "Moderate",
      description: "Some spread, but a few names still dominate.",
    };
  if (score < 75)
    return {
      label: "Spread out",
      description: "Broad enough that no single name can sink it.",
    };
  return {
    label: "Broad",
    description: "Index-fund-broad — very little single-name risk.",
  };
}

function riskBandFor(score: number): ScoreBand {
  if (score < 30)
    return { label: "Conservative", description: "Calm, defensive theme mix." };
  if (score < 55)
    return { label: "Balanced", description: "A mix of steady and speculative." };
  if (score < 75)
    return { label: "Aggressive", description: "Leans hard into growth/momentum themes." };
  return { label: "High-octane", description: "Concentrated in the hottest, most volatile themes." };
}

/** Herfindahl-style concentration → effective position count → 0-100
 * diversification score. Index-themed tickers get credit for the spread
 * already inside the fund via INDEX_LOOKTHROUGH_SLOTS. */
function diversificationScoreFromHoldings(
  holdings: Array<{ ticker: string; value: number }>
): number {
  const total = holdings.reduce((s, h) => s + Math.max(0, h.value), 0);
  if (total <= 0 || holdings.length === 0) return 0;
  const hhi = holdings.reduce((s, h) => {
    const w = Math.max(0, h.value) / total;
    const theme = forecastThemeForTicker(h.ticker);
    const lookthrough = theme === "index" ? INDEX_LOOKTHROUGH_SLOTS : 1;
    return s + (w * w) / lookthrough;
  }, 0);
  if (hhi <= 0) return 100;
  const effectiveN = 1 / hhi;
  const score =
    ((effectiveN - 1) / (DIVERSIFICATION_CEILING_N - 1)) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
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
  if (risk >= 75 && diversification < 30) {
    return {
      animal: "Shark",
      emoji: "🦈",
      tagline: "A few high-conviction bets, hunted with total focus.",
    };
  }
  if (risk >= 75 && diversification >= 30) {
    return {
      animal: "Wolf",
      emoji: "🐺",
      tagline: "Runs with a pack of aggressive names across several fronts.",
    };
  }
  if (diversification >= 55) {
    return {
      animal: "Elephant",
      emoji: "🐘",
      tagline: "Broad, steady, and hard to spook — never one bad day away from trouble.",
    };
  }
  if (risk < 35 && diversification < 30) {
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
  const diversificationScore = diversificationScoreFromHoldings(positive);

  const total = positive.reduce((s, h) => s + h.value, 0);
  let riskScore = 50;
  let expectedAnnualReturnPct = 0;
  let maxDrawdownPct = 0;
  const themeWeights = new Map<ForecastTheme, number>();
  if (total > 0) {
    let weightedRisk = 0;
    let weightedReturn = 0;
    let weightedDrawdown = 0;
    for (const h of positive) {
      const theme = forecastThemeForTicker(h.ticker);
      const weight = h.value / total;
      weightedRisk += weight * (THEME_RISK_SCORE[theme] ?? 50);
      weightedReturn += weight * impliedAnnualReturnForTheme(theme) * 100;
      weightedDrawdown += weight * (THEME_MAX_DRAWDOWN_PCT[theme] ?? 40);
      themeWeights.set(theme, (themeWeights.get(theme) ?? 0) + weight);
    }
    riskScore = Math.round(weightedRisk);
    expectedAnnualReturnPct = Math.round(weightedReturn * 10) / 10;
    maxDrawdownPct = Math.round(weightedDrawdown);
  }

  let dominantTheme: ForecastTheme = "other";
  let bestWeight = -1;
  for (const [theme, weight] of themeWeights) {
    if (weight > bestWeight) {
      bestWeight = weight;
      dominantTheme = theme;
    }
  }

  const beta = riskScore / BETA_NEUTRAL_RISK_SCORE;
  const capmExpectedPct =
    RISK_FREE_ANNUAL_PCT + beta * (MARKET_ANNUAL_RETURN_PCT - RISK_FREE_ANNUAL_PCT);
  const modeledAlphaPct =
    positive.length > 0
      ? Math.round((expectedAnnualReturnPct - capmExpectedPct) * 10) / 10
      : 0;

  const { animal, emoji, tagline } = pickAnimal({
    diversification: diversificationScore,
    risk: riskScore,
    theme: dominantTheme,
    positionCount: positive.length,
  });

  return {
    diversificationScore,
    diversificationBand: diversificationBandFor(diversificationScore),
    riskScore,
    riskBand: riskBandFor(riskScore),
    dominantTheme,
    animal,
    animalEmoji: emoji,
    tagline: `${tagline} Mostly ${THEME_LABEL[dominantTheme]}.`,
    expectedAnnualReturnPct,
    maxDrawdownPct,
    modeledAlphaPct,
  };
}
