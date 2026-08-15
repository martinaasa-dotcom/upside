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

/**
 * Risk score to CAPM beta. This used to be `riskScore / 50`, which put a
 * broad index fund (risk 15) at beta 0.3 when an index tracking the market
 * is beta 1.0 by definition, so a plain index book showed a fake negative
 * alpha and every risky book got an unfairly low hurdle to clear.
 *
 * Anchored instead so index lands at ~1.0 and the hottest themes land
 * around 2.8, which is the right neighbourhood for a concentrated
 * single-name growth book.
 */
function betaForRiskScore(riskScore: number): number {
  const INDEX_RISK = 15;
  const INDEX_BETA = 1.0;
  const SLOPE = 0.0225; // risk 95 (crypto) lands at ~2.8
  return Math.max(0.2, INDEX_BETA + (riskScore - INDEX_RISK) * SLOPE);
}

export type ScoreBand = { label: string; description: string };

export type PortfolioPersonality = {
  /** 0-100, higher = more spread across effectively-independent positions. */
  diversificationScore: number;
  diversificationBand: ScoreBand;
  /** 0-100, higher = hotter/more volatile theme mix. */
  riskScore: number;
  riskBand: ScoreBand;
  /** 0-100, weight of the single largest position. */
  convictionScore: number;
  convictionBand: ScoreBand;
  /** Ticker behind convictionScore, if any. */
  topTicker: string | null;
  /** 0-100, weight sitting in the heaviest forecast theme. */
  specialistScore: number;
  /** Themes that actually move the needle (>= 8% of equity). */
  themeCount: number;
  /** Cash as a % of NAV. Negative cash (margin) stays negative. */
  cashPct: number;
  dominantTheme: ForecastTheme;
  animal: string;
  animalEmoji: string;
  tagline: string;
  /** Full bestiary entry backing `animal` — the whole card, not just the
   * one-liner, so a UI can show strength/watchFor without a second lookup. */
  archetype: AnimalArchetype;
  /**
   * Why *this* book got *this* animal, quoting its own scores. The
   * bestiary copy describes the archetype in the abstract and reads the
   * same for everyone who lands on it; this is the part that connects the
   * badge to the person looking at it.
   */
  whyThisAnimal: string;
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
    criteria: "No positions yet",
    tagline: "No positions yet. Every book starts here.",
    vibe: "Pure potential and zero commitments. Every other animal on this list started right here, deciding what to hatch into.",
    strength: "Nothing to lose, no bad habits to unlearn, a completely clean slate.",
    watchFor: "Sitting in cash forever isn't a strategy either. Hatch when you're ready.",
  },
  {
    id: "squirrel",
    animal: "Squirrel",
    emoji: "🐿️",
    criteria: "Cash is at least ~28% of the book",
    tagline: "Keeps a fat cash stash so a dry season doesn't starve the book.",
    vibe: "Positions exist, but dry powder is the real personality. Ready to pounce, or just nervously hoarding.",
    strength: "Can buy the dip without selling something else first.",
    watchFor: "Cash that never gets deployed is just a savings account with extra steps.",
  },
  {
    id: "dragon",
    animal: "Dragon",
    emoji: "🐉",
    criteria: "Crypto is the heaviest theme, and it is a real slice of the book",
    tagline: "Hoards volatile treasure, breathes fire on rallies and dips.",
    vibe: "Lives and dies by the crypto cycle, and wouldn't have it any other way. When the hoard is up, nothing moves faster.",
    strength: "First in line for the biggest, fastest moves in the market.",
    watchFor: "Dragons sleep on hoards that can lose half their value by morning.",
  },
  {
    id: "panda",
    animal: "Panda",
    emoji: "🐼",
    criteria: "Two thirds or more in a single non-crypto, non-index theme",
    tagline: "Eats one thing. When that theme moves, the whole book moves.",
    vibe: "Not random concentration. A chosen diet. Space pandas, AI pandas, semi pandas. Same animal, different bamboo.",
    strength: "Gets the full ride when the one theme is right.",
    watchFor: "A panda with no bamboo left has nothing else to eat.",
  },
  {
    id: "octopus",
    animal: "Octopus",
    emoji: "🐙",
    criteria: "Three or more live themes",
    tagline: "A tentacle in every pond. Many habitats, no single bet on the weather.",
    vibe: "Rotated, collected, or just curious. The book is not one story. It is several, running in parallel.",
    strength: "A bad year in one habitat does not empty the tank.",
    watchFor: "Eight tentacles can become eight half-finished reasons.",
  },
  {
    id: "shark",
    animal: "Shark",
    emoji: "🦈",
    criteria: "Hot themes and a fat largest position",
    tagline: "A few big bets, hunted with total focus.",
    vibe: "No wasted motion and no safety net. Every name earned its spot because you meant it, not because it felt comfortable.",
    strength: "Maximum upside when you're right, with nothing watering down the payoff.",
    watchFor: "One bad call and there's no net underneath to catch it.",
  },
  {
    id: "wolf",
    animal: "Wolf",
    emoji: "🐺",
    criteria: "Hot themes, spread across a pack",
    tagline: "Runs with a pack of aggressive names across several fronts.",
    vibe: "Bold, but never betting the whole den on one hunt. Aggressive and spread at once is the rare combination.",
    strength: "Chases growth on more than one front instead of picking just one.",
    watchFor: "A pack of hot names can still all go cold together if they are more correlated than they look.",
  },
  {
    id: "falcon",
    animal: "Falcon",
    emoji: "🦅",
    criteria: "Three names or fewer",
    tagline: "Small, sharp-eyed, and diving hard on very few targets.",
    vibe: "Precision over volume. Every position was picked, not just added, and there's nowhere for a bad call to hide.",
    strength: "Laser focus on the names you're surest about, no clutter.",
    watchFor: "A falcon with a bad target has nowhere else to turn.",
  },
  {
    id: "turtle",
    animal: "Turtle",
    emoji: "🐢",
    criteria: "Calm themes, still concentrated",
    tagline: "A small, well-armored shell, slow and steady on purpose.",
    vibe: "Concentrated by choice, not by accident, in names calm enough that the shell rarely needs to close.",
    strength: "Low-drama compounding, calm under pressure, on purpose.",
    watchFor: "Concentrated-and-calm only works as long as those few picks stay calm too.",
  },
  {
    id: "owl",
    animal: "Owl",
    emoji: "🦉",
    criteria: "Calm themes, and actually spread out",
    tagline: "Watchful and risk-aware, with the spread to match.",
    vibe: "Sees what's coming, and is not all-in on one perch while watching. Calm plus breadth, not calm plus a single name.",
    strength: "Rarely surprised, rarely rattled, a genuinely calm book.",
    watchFor: "All that watching can turn into missed swoops. Calm isn't the same as complacent.",
  },
  {
    id: "elephant",
    animal: "Elephant",
    emoji: "🐘",
    criteria: "Index-broad, or an index fund doing the spreading",
    tagline: "Broad, steady, and hard to spook. Never one bad day away from trouble.",
    vibe: "Built to survive any single name's worst day. Slow to startle, and remembers every cycle it's lived through.",
    strength: "Resilient. No single ticker can sink this book on its own.",
    watchFor: "Broad can drift into bland. Worth checking the spread is on purpose, not just default.",
  },
  {
    id: "fox",
    animal: "Fox",
    emoji: "🦊",
    criteria: "The flexible middle. Not extreme on cash, diet, heat, or spread",
    tagline: "Clever and adaptable, some offense, some defense, no dogma.",
    vibe: "Some offense, some defense. Doesn't need a label.",
    strength: "Adaptable, ready to lean either way as the market shifts.",
    watchFor: "Flexible can turn into unfocused. Know what this book is actually for.",
  },
];

const ARCHETYPE_BY_ID = new Map(ANIMAL_BESTIARY.map((a) => [a.id, a]));

/** Per-animal card chrome. Full Tailwind class strings so JIT picks them
 * up; keyed by archetype id so Wolf/Shark/Fox never share a grey shell. */
export type AnimalCardTone = {
  bar: string;
  border: string;
  wash: string;
  well: string;
  name: string;
  milestone: string;
};

export const ANIMAL_CARD_TONE: Record<string, AnimalCardTone> = {
  hatchling: {
    bar: "bg-zinc-400",
    border: "border-zinc-600/80",
    wash: "bg-zinc-500/10",
    well: "bg-zinc-500/20",
    name: "text-zinc-300",
    milestone: "bg-zinc-400",
  },
  squirrel: {
    bar: "bg-amber-400",
    border: "border-amber-500/40",
    wash: "bg-amber-500/10",
    well: "bg-amber-500/20",
    name: "text-amber-300",
    milestone: "bg-amber-400",
  },
  dragon: {
    bar: "bg-rose-500",
    border: "border-rose-500/45",
    wash: "bg-rose-500/10",
    well: "bg-rose-500/20",
    name: "text-rose-300",
    milestone: "bg-rose-400",
  },
  panda: {
    bar: "bg-emerald-400",
    border: "border-emerald-500/40",
    wash: "bg-emerald-500/10",
    well: "bg-emerald-500/20",
    name: "text-emerald-300",
    milestone: "bg-emerald-400",
  },
  octopus: {
    bar: "bg-violet-400",
    border: "border-violet-500/45",
    wash: "bg-violet-500/10",
    well: "bg-violet-500/20",
    name: "text-violet-300",
    milestone: "bg-violet-400",
  },
  shark: {
    bar: "bg-cyan-400",
    border: "border-cyan-500/45",
    wash: "bg-cyan-500/10",
    well: "bg-cyan-500/20",
    name: "text-cyan-300",
    milestone: "bg-cyan-400",
  },
  wolf: {
    bar: "bg-sky-400",
    border: "border-sky-500/40",
    wash: "bg-sky-500/10",
    well: "bg-sky-500/20",
    name: "text-sky-300",
    milestone: "bg-sky-400",
  },
  falcon: {
    bar: "bg-yellow-400",
    border: "border-yellow-500/40",
    wash: "bg-yellow-500/10",
    well: "bg-yellow-500/20",
    name: "text-yellow-300",
    milestone: "bg-yellow-400",
  },
  turtle: {
    bar: "bg-teal-400",
    border: "border-teal-500/40",
    wash: "bg-teal-500/10",
    well: "bg-teal-500/20",
    name: "text-teal-300",
    milestone: "bg-teal-400",
  },
  owl: {
    bar: "bg-indigo-400",
    border: "border-indigo-500/45",
    wash: "bg-indigo-500/10",
    well: "bg-indigo-500/20",
    name: "text-indigo-300",
    milestone: "bg-indigo-400",
  },
  elephant: {
    bar: "bg-stone-400",
    border: "border-stone-500/50",
    wash: "bg-stone-500/10",
    well: "bg-stone-500/25",
    name: "text-stone-300",
    milestone: "bg-stone-400",
  },
  fox: {
    bar: "bg-orange-400",
    border: "border-orange-400/45",
    wash: "bg-orange-400/10",
    well: "bg-orange-400/20",
    name: "text-orange-300",
    milestone: "bg-orange-400",
  },
};

export function animalCardTone(id: string | undefined | null): AnimalCardTone {
  return (id && ANIMAL_CARD_TONE[id]) || ANIMAL_CARD_TONE.hatchling!;
}

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
  ai_infra: "AI computers",
  ai_power: "electricity for AI",
  crypto: "crypto",
  space: "space",
  semi: "computer chips",
  fintech: "money apps",
  software: "software",
  healthcare: "healthcare",
  // Covers the defense primes as well as pure drone/autonomy names, so
  // "drones" alone would mislabel a Lockheed or an RTX.
  drones: "defense and drones",
  index: "a bit of everything",
  // Not "a mixed bag": this is the bucket for names the sector map doesn't
  // recognise, and as the label on a 51% slice it explained nothing.
  other: "other businesses",
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

function convictionBandFor(score: number): ScoreBand {
  if (score >= 50)
    return {
      label: "All-in",
      description: "One name is half the book or more.",
    };
  if (score >= 35)
    return {
      label: "A big bet",
      description: "The largest position really decides the year.",
    };
  if (score >= 20)
    return {
      label: "Leaning",
      description: "A favourite, but not the whole story.",
    };
  return {
    label: "No single name",
    description: "Nothing dominates. The book moves as a group.",
  };
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

/**
 * Same decision order as ANIMAL_BESTIARY. Keep the two in sync.
 *
 * The static bestiary copy describes the animal in general; it never
 * explains why *you* are one, which made the badge feel assigned at random.
 * Every branch below has a specific numeric trigger, so the reason is
 * already known at the moment of the decision. Returning it quotes the
 * viewer's own scores back at them instead of a generic personality read.
 */
function pickAnimal(opts: {
  diversification: number;
  risk: number;
  theme: ForecastTheme;
  specialistScore: number;
  themeCount: number;
  conviction: number;
  cashPct: number;
  positionCount: number;
}): { archetype: AnimalArchetype; why: string } {
  const {
    diversification,
    risk,
    theme,
    specialistScore,
    themeCount,
    conviction,
    cashPct,
    positionCount,
  } = opts;
  const names = positionCount === 1 ? "1 name" : `${positionCount} names`;
  const top = `largest position ${conviction}%`;

  if (positionCount === 0) {
    return {
      archetype: archetype("hatchling"),
      why: "Nothing held yet, so there's nothing to read.",
    };
  }
  if (cashPct >= 28) {
    return {
      archetype: archetype("squirrel"),
      why: `Cash is ${cashPct}% of the book. That stash is doing more work than any single ticker right now.`,
    };
  }
  if (theme === "crypto" && specialistScore >= 35) {
    return {
      archetype: archetype("dragon"),
      why: `Crypto is ${specialistScore}% of equity, with risk at ${risk}/100. Nothing else in the bestiary moves like that.`,
    };
  }
  if (
    specialistScore >= 68 &&
    theme !== "crypto" &&
    theme !== "index"
  ) {
    return {
      archetype: archetype("panda"),
      why: `${specialistScore}% of the book sits in ${THEME_LABEL[theme]}. One diet, on purpose.`,
    };
  }
  if (themeCount >= 3) {
    return {
      archetype: archetype("octopus"),
      why: `${themeCount} live themes across ${names}. This is not one habitat. It is a handful running in parallel.`,
    };
  }
  if (
    risk >= 72 &&
    (conviction >= 38 || (diversification < 28 && positionCount <= 6))
  ) {
    return {
      archetype: archetype("shark"),
      why: `Risk ${risk}/100 with ${top}. Across ${names}, a couple of hot positions decide almost everything.`,
    };
  }
  if (risk >= 72) {
    return {
      archetype: archetype("wolf"),
      why: `Risk ${risk}/100 is top-band, but ${diversification}/100 diversification across ${names} means no single position gets to decide your year.`,
    };
  }
  if (positionCount <= 3) {
    return {
      archetype: archetype("falcon"),
      why: `Just ${names}. At that count every single one matters enormously, whichever way it goes.`,
    };
  }
  if (risk < 38 && (conviction >= 40 || diversification < 35)) {
    return {
      archetype: archetype("turtle"),
      why: `Risk only ${risk}/100 and concentrated (${top}). A short list of genuinely calm positions.`,
    };
  }
  if (risk < 42 && diversification >= 40) {
    return {
      archetype: archetype("owl"),
      why: `Risk ${risk}/100 sits at the calm end, and diversification ${diversification}/100 means the watching actually has breadth behind it.`,
    };
  }
  if (diversification >= 68 || (theme === "index" && specialistScore >= 50)) {
    return {
      archetype: archetype("elephant"),
      why: `Diversification ${diversification}/100 across ${names}. Spread this wide is hard to knock over.`,
    };
  }
  return {
    archetype: archetype("fox"),
    why: `Risk ${risk}/100, diversification ${diversification}/100, ${themeCount} themes, ${top}. Mid-table on every axis, which is its own kind of choice.`,
  };
}

export function buildPortfolioPersonality(
  holdings: Array<{ ticker: string; value: number }>,
  cash = 0
): PortfolioPersonality {
  const positive = holdings.filter((h) => h.value > 0);
  const diversificationScore = diversificationScoreFromHoldings(positive);

  const total = positive.reduce((s, h) => s + h.value, 0);
  let riskScore = 50;
  let expectedAnnualReturnPct = 0;
  let maxDrawdownPct = 0;
  let convictionScore = 0;
  let topTicker: string | null = null;
  const themeWeights = new Map<ForecastTheme, number>();
  if (total > 0) {
    let weightedRisk = 0;
    let weightedReturn = 0;
    let weightedDrawdown = 0;
    let topValue = -1;
    for (const h of positive) {
      const theme = forecastThemeForTicker(h.ticker);
      const weight = h.value / total;
      weightedRisk += weight * (THEME_RISK_SCORE[theme] ?? 50);
      weightedReturn += weight * impliedAnnualReturnForTheme(theme) * 100;
      weightedDrawdown += weight * (THEME_MAX_DRAWDOWN_PCT[theme] ?? 40);
      themeWeights.set(theme, (themeWeights.get(theme) ?? 0) + weight);
      if (h.value > topValue) {
        topValue = h.value;
        topTicker = h.ticker;
        convictionScore = Math.round(weight * 100);
      }
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
  const specialistScore =
    bestWeight > 0 ? Math.round(bestWeight * 100) : 0;
  const themeCount = [...themeWeights.values()].filter((w) => w >= 0.08).length;

  const nav = total + cash;
  const cashPct =
    Math.abs(nav) > 1e-9 ? Math.round((cash / nav) * 100) : cash > 0 ? 100 : 0;

  const beta = betaForRiskScore(riskScore);
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
    specialistScore,
    themeCount,
    conviction: convictionScore,
    cashPct,
    positionCount: positive.length,
  });

  return {
    diversificationScore,
    diversificationBand: diversificationBandFor(diversificationScore),
    riskScore,
    riskBand: riskBandFor(riskScore),
    convictionScore,
    convictionBand: convictionBandFor(convictionScore),
    topTicker,
    specialistScore,
    themeCount,
    cashPct,
    dominantTheme,
    animal: picked.archetype.animal,
    animalEmoji: picked.archetype.emoji,
    tagline: `${picked.archetype.tagline} Mostly ${THEME_LABEL[dominantTheme]}.`,
    archetype: picked.archetype,
    whyThisAnimal: picked.why,
    expectedAnnualReturnPct,
    maxDrawdownPct,
    modeledAlphaPct,
  };
}
