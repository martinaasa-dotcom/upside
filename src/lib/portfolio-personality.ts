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
  /** Full bestiary entry backing `animal` — the whole card, not just the
   * one-liner, so a UI can show strength/watchFor without a second lookup. */
  archetype: AnimalArchetype;
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

/**
 * The full field guide — every possible archetype a book can land on, in
 * the same order pickAnimal() checks them (most extreme/specific first,
 * most general last). Exported so a "what do the animals mean?" UI can
 * show the whole taxonomy, not just whichever one you got.
 */
export type AnimalArchetype = {
  /** Stable key, independent of the display name. */
  id: string;
  animal: string;
  emoji: string;
  /** Plain-English trigger — what combination of scores lands here. */
  criteria: string;
  /** The one-liner used everywhere the card needs to stay compact. */
  tagline: string;
  /** A fuller two-line personality read, for a "learn more" surface. */
  vibe: string;
  strength: string;
  watchFor: string;
};

export const ANIMAL_BESTIARY: AnimalArchetype[] = [
  {
    id: "hatchling",
    animal: "Hatchling",
    emoji: "🥚",
    criteria: "All cash, no positions yet",
    tagline: "All cash, no positions yet. Every book starts here.",
    vibe: "Pure potential and zero commitments. Every other animal on this list started right here, deciding what to hatch into.",
    strength: "Nothing to lose, no bad habits to unlearn, a completely clean slate.",
    watchFor: "Sitting in cash forever isn't a strategy either. Hatch when you're ready.",
  },
  {
    id: "dragon",
    animal: "Dragon",
    emoji: "🐉",
    criteria: "Crypto-heavy and high risk",
    tagline: "Hoards volatile treasure, breathes fire on rallies (and dips).",
    vibe: "Lives and dies by the crypto cycle, and wouldn't have it any other way. When the hoard is up, nothing moves faster.",
    strength: "First in line for the biggest, fastest moves in the market.",
    watchFor: "Dragons sleep on hoards that can lose half their value by morning.",
  },
  {
    id: "shark",
    animal: "Shark",
    emoji: "🦈",
    criteria: "High risk, few names",
    tagline: "A few high-conviction bets, hunted with total focus.",
    vibe: "No wasted motion and no hedge. Every position earned its spot through conviction, not comfort.",
    strength: "Maximum upside when the thesis is right, with nothing diluting the payoff.",
    watchFor: "One bad call and there's no diversification net underneath to catch it.",
  },
  {
    id: "wolf",
    animal: "Wolf",
    emoji: "🐺",
    criteria: "High risk, decent spread",
    tagline: "Runs with a pack of aggressive names across several fronts.",
    vibe: "Bold, but never betting the whole den on one hunt. The rare combination of aggressive AND spread out.",
    strength: "Chases growth on multiple fronts at once instead of picking just one.",
    watchFor: "A pack of hot names can still all go cold together if they're more correlated than they look.",
  },
  {
    id: "elephant",
    animal: "Elephant",
    emoji: "🐘",
    criteria: "Very diversified",
    tagline: "Broad, steady, and hard to spook. Never one bad day away from trouble.",
    vibe: "Built to survive any single name's worst day. Slow to startle, and remembers every cycle it's lived through.",
    strength: "Resilient, no single ticker can sink this book on its own.",
    watchFor: "Broad can drift into bland, worth checking the spread is on purpose, not just default.",
  },
  {
    id: "turtle",
    animal: "Turtle",
    emoji: "🐢",
    criteria: "Low risk, concentrated",
    tagline: "A small, well-armored shell, slow and steady on purpose.",
    vibe: "Concentrated by choice, not by accident, in names calm enough that the shell rarely needs to close.",
    strength: "Low-drama compounding, calm under pressure, on purpose.",
    watchFor: "Concentrated-and-calm only works as long as those few picks stay calm too.",
  },
  {
    id: "owl",
    animal: "Owl",
    emoji: "🦉",
    criteria: "Low risk, spread wide",
    tagline: "Watchful and risk-aware, spread wide across the board.",
    vibe: "Sees what's coming before it happens, and spreads the bets wide enough that no single surprise really lands.",
    strength: "Rarely surprised, rarely rattled, a genuinely calm book.",
    watchFor: "All that watching can turn into missed swoops. Calm isn't the same as complacent.",
  },
  {
    id: "falcon",
    animal: "Falcon",
    emoji: "🦅",
    criteria: "Very few positions",
    tagline: "Small, sharp-eyed, and diving hard on very few targets.",
    vibe: "Precision over volume. Every position was picked, not just added, and there's nowhere for a bad call to hide.",
    strength: "Laser focus on the highest-conviction ideas, no clutter.",
    watchFor: "A falcon with a bad target has nowhere else to turn.",
  },
  {
    id: "fox",
    animal: "Fox",
    emoji: "🦊",
    criteria: "The flexible middle ground",
    tagline: "Clever and adaptable, some offense, some defense, no dogma.",
    vibe: "Doesn't fit neatly into any single box, and that's rather the point. Equal parts opportunistic and careful.",
    strength: "Adaptable, ready to lean either way as the market shifts.",
    watchFor: "Jack-of-all-trades can mean master of none, worth knowing what this book is actually FOR.",
  },
];

const ARCHETYPE_BY_ID = new Map(ANIMAL_BESTIARY.map((a) => [a.id, a]));

/** Stable color per forecast theme, shared by every theme chart (Lab's
 * allocation fingerprint, the community sector chart) and their legends so
 * a swatch always means the same theme wherever you see it. */
export const THEME_COLOR: Record<ForecastTheme, string> = {
  crypto: "#f59e0b",
  space: "#a78bfa",
  ai_infra: "#38bdf8",
  drones: "#22d3ee",
  semi: "#818cf8",
  ai_power: "#e879f9",
  fintech: "#34d399",
  software: "#60a5fa",
  other: "#a1a1aa",
  healthcare: "#fb7185",
  index: "#2dd4bf",
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
    description: "Index-fund-broad, very little single-name risk.",
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

function archetype(id: string): AnimalArchetype {
  const found = ARCHETYPE_BY_ID.get(id);
  if (!found) throw new Error(`Unknown animal archetype id: ${id}`);
  return found;
}

/** Same decision order as ANIMAL_BESTIARY — keep the two in sync. */
function pickAnimal(opts: {
  diversification: number;
  risk: number;
  theme: ForecastTheme;
  positionCount: number;
}): AnimalArchetype {
  const { diversification, risk, theme, positionCount } = opts;

  if (positionCount === 0) return archetype("hatchling");
  if (theme === "crypto" && risk >= 80) return archetype("dragon");
  if (risk >= 75 && diversification < 30) return archetype("shark");
  if (risk >= 75 && diversification >= 30) return archetype("wolf");
  if (diversification >= 55) return archetype("elephant");
  if (risk < 35 && diversification < 30) return archetype("turtle");
  if (risk < 40) return archetype("owl");
  if (positionCount <= 3) return archetype("falcon");
  return archetype("fox");
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

  const picked = pickAnimal({
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
    animal: picked.animal,
    animalEmoji: picked.emoji,
    tagline: `${picked.tagline} Mostly ${THEME_LABEL[dominantTheme]}.`,
    archetype: picked,
    expectedAnnualReturnPct,
    maxDrawdownPct,
    modeledAlphaPct,
  };
}
