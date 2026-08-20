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
    criteria: "No names yet",
    tagline: "No names yet. Every portfolio starts here.",
    vibe: "Nothing picked. Every other animal on this list started right here, deciding what to hatch into.",
    strength: "Nothing to lose, and no bad habits yet.",
    watchFor: "Cash sitting forever is just a savings account. Hatch when you're ready.",
  },
  {
    id: "squirrel",
    animal: "Squirrel",
    emoji: "🐿️",
    criteria: "Cash is at least about 28% of your portfolio",
    tagline: "Keeps a fat cash stash so a quiet stretch doesn't starve your portfolio.",
    vibe: "There are names, but the cash pile is the real personality. Ready to pounce, or just nervously hoarding.",
    strength: "Can buy when prices drop without selling something else first.",
    watchFor: "Cash that never gets used is just a savings account with extra steps.",
  },
  {
    id: "dragon",
    animal: "Dragon",
    emoji: "🐉",
    criteria: "Crypto is the heaviest group, and a real slice of your portfolio",
    tagline: "Sits on jumpy treasure. Up fast, down fast.",
    vibe: "Lives and dies by crypto, and likes it that way. When the pile is up, nothing moves faster.",
    strength: "First in line when those names run.",
    watchFor: "The pile can lose half its value by morning.",
  },
  {
    id: "panda",
    animal: "Panda",
    emoji: "🐼",
    criteria: "Two thirds or more in one kind of stock that doesn't have its own animal yet",
    tagline: "Eats one thing. When that group moves, the whole portfolio moves.",
    vibe: "Not random. A chosen diet, just not one of the groups with its own name yet.",
    strength: "Gets the full ride when that one group is right.",
    watchFor: "A panda with no bamboo left has nothing else to eat.",
  },
  {
    id: "beaver",
    animal: "Beaver",
    emoji: "🦫",
    criteria: "Two thirds or more in AI computer builders",
    tagline: "Builds the same structure over and over. Every log goes into one dam.",
    vibe: "Convinced the dam is worth it. When the water (the demand for compute) keeps coming, the dam pays for itself many times over.",
    strength: "Gets the full ride when that one group is right.",
    watchFor: "A dam holds until it doesn't. All the effort sits behind one wall.",
  },
  {
    id: "rhino",
    animal: "Rhino",
    emoji: "🦏",
    criteria: "Two thirds or more in data-center power stocks",
    tagline: "Heavy, armored, and built for one job: keeping the lights on for everyone else.",
    vibe: "Not flashy. The unglamorous, physically heavy side of a bet everyone else is also making, just further downstream.",
    strength: "Gets the full ride when that one group is right.",
    watchFor: "Armor is heavy. It doesn't move fast if the story changes.",
  },
  {
    id: "badger",
    animal: "Badger",
    emoji: "🦡",
    criteria: "Two thirds or more in chip makers",
    tagline: "Digs straight down into one thing: the chips underneath everything else.",
    vibe: "Doesn't care what's built on top. Cares who made the part everyone else needs.",
    strength: "Gets the full ride when that one group is right.",
    watchFor: "A badger that's dug in one direction has a long way back up if it's wrong.",
  },
  {
    id: "scorpion",
    animal: "Scorpion",
    emoji: "🦂",
    criteria: "Two thirds or more in defense and drone stocks",
    tagline: "Armored and built to strike. One group of businesses, chosen on purpose.",
    vibe: "A bet on who gets paid regardless of who's winning. Quiet until it isn't.",
    strength: "Gets the full ride when that one group is right.",
    watchFor: "Budgets and contracts can shift fast, and a scorpion has nowhere else to hide.",
  },
  {
    id: "otter",
    animal: "Otter",
    emoji: "🦦",
    criteria: "Two thirds or more in payments and finance stocks",
    tagline: "Plays in one river its whole life: money moving from one place to another.",
    vibe: "Every business here makes money on money moving. Different companies, same river.",
    strength: "Gets the full ride when that one group is right.",
    watchFor: "One river running dry leaves an otter with nowhere else to swim.",
  },
  {
    id: "chameleon",
    animal: "Chameleon",
    emoji: "🦎",
    criteria: "Two thirds or more in software stocks",
    tagline: "Blends into whatever it's sitting on. One group, many different-looking businesses.",
    vibe: "Software touches everything, which can look like variety even when it's one group of businesses reacting to the same news.",
    strength: "Gets the full ride when that one group is right.",
    watchFor: "Looking varied and actually being varied are not the same thing.",
  },
  {
    id: "flamingo",
    animal: "Flamingo",
    emoji: "🦩",
    criteria: "Two thirds or more in healthcare stocks",
    tagline: "Stands in one spot for a long time, on purpose, waiting for something slower than a quarter.",
    vibe: "Healthcare moves on a different clock than the rest of the market. A flamingo is comfortable with that.",
    strength: "Gets the full ride when that one group is right, on its own timeline.",
    watchFor: "Patience only pays off if the underlying story was actually right.",
  },
  {
    id: "octopus",
    animal: "Octopus",
    emoji: "🐙",
    criteria: "Three or more kinds of stocks, genuinely spread across them",
    tagline: "A tentacle in every pond. Many kinds of stocks, no single bet on the weather.",
    vibe: "Curious, or just collected. Your portfolio is not one story. It is several, running side by side.",
    strength: "A bad year in one pond does not empty the tank.",
    watchFor: "Eight tentacles can become eight half-finished reasons.",
  },
  {
    id: "squid",
    animal: "Squid",
    emoji: "🦑",
    criteria: "Three or more kinds of stocks, and the mix itself runs hot",
    tagline: "Many kinds of stocks, and every one of them jumpy. Fast in every direction at once.",
    vibe: "Not one wild bet, several. The spread doesn't calm this book down, it just gives the swings more places to come from.",
    strength: "A bad year in one pond does not empty the tank, and there's real upside in more than one place.",
    watchFor: "Several jumpy names can all have a bad week at the same time.",
  },
  {
    id: "crab",
    animal: "Crab",
    emoji: "🦀",
    criteria: "Three or more kinds of stocks, but a couple of names still carry most of the weight",
    tagline: "Sideways on purpose. A few different groups, but the weight still sits on a couple of names.",
    vibe: "Not a single bet, and not really spread out either. A few different stories, one or two of them doing most of the carrying.",
    strength: "More than one place for good news to come from.",
    watchFor: "The mix looks varied on the label, less so once you weigh it.",
  },
  {
    id: "shark",
    animal: "Shark",
    emoji: "🦈",
    criteria: "Jumpy names and one really big position",
    tagline: "A few big bets, hunted with total focus.",
    vibe: "No wasted motion and no safety net. Every name is there because you meant it.",
    strength: "Gets the full ride when those few names are right.",
    watchFor: "One bad call and there's no net underneath.",
  },
  {
    id: "wolf",
    animal: "Wolf",
    emoji: "🐺",
    criteria: "Jumpy names, spread across a pack",
    tagline: "Runs with a pack of jumpy names, not just one.",
    vibe: "Bold, but never betting the whole den on one hunt. Jumpy and spread at once is the rare mix.",
    strength: "Chases the fast names on more than one front.",
    watchFor: "A pack of jumpy names can all fall together if they move as one.",
  },
  {
    id: "falcon",
    animal: "Falcon",
    emoji: "🦅",
    criteria: "Three names or fewer",
    tagline: "Small, sharp-eyed, and diving hard on very few targets.",
    vibe: "Every name was picked, not just added. Nowhere for a bad call to hide.",
    strength: "Focus on the names you're surest about. No clutter.",
    watchFor: "A falcon with a bad target has nowhere else to turn.",
  },
  {
    id: "turtle",
    animal: "Turtle",
    emoji: "🐢",
    criteria: "Calm names, still a short list",
    tagline: "A small, well-armored shell, slow and steady on purpose.",
    vibe: "A short list on purpose, in names calm enough that the shell rarely needs to close.",
    strength: "Quiet growth, calm under pressure, on purpose.",
    watchFor: "Short-and-calm only works while those few picks stay calm too.",
  },
  {
    id: "owl",
    animal: "Owl",
    emoji: "🦉",
    criteria: "Calm names, and actually spread out",
    tagline: "Watchful and calm, and actually spread out.",
    vibe: "Sees what's coming, and is not all-in on one perch. Calm plus breadth, not calm plus a single name.",
    strength: "Rarely surprised, rarely rattled. A genuinely calm portfolio.",
    watchFor: "All that watching can turn into missed chances. Calm is not the same as asleep.",
  },
  {
    id: "elephant",
    animal: "Elephant",
    emoji: "🐘",
    criteria: "Index-broad, or an index fund doing the spreading",
    tagline: "Broad, steady, and hard to spook. Never one bad day away from trouble.",
    vibe: "Built to survive any single name's worst day. Slow to startle, and remembers every cycle it's lived through.",
    strength: "No single ticker can sink this portfolio on its own.",
    watchFor: "Broad can drift into bland. Check the spread is on purpose, not just default.",
  },
  {
    id: "fox",
    animal: "Fox",
    emoji: "🦊",
    criteria: "The flexible middle. Not extreme on cash, diet, heat, or spread",
    tagline: "Clever and adaptable. Some offense, some defense. No dogma.",
    vibe: "Some offense, some defense. Doesn't need a label.",
    strength: "Can lean either way when prices shift.",
    watchFor: "Flexible can turn into unfocused. Know what this portfolio is actually for.",
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
  beaver: {
    bar: "bg-lime-400",
    border: "border-lime-500/40",
    wash: "bg-lime-500/10",
    well: "bg-lime-500/20",
    name: "text-lime-300",
    milestone: "bg-lime-400",
  },
  rhino: {
    bar: "bg-slate-400",
    border: "border-slate-500/40",
    wash: "bg-slate-500/10",
    well: "bg-slate-500/20",
    name: "text-slate-300",
    milestone: "bg-slate-400",
  },
  badger: {
    bar: "bg-neutral-400",
    border: "border-neutral-500/40",
    wash: "bg-neutral-500/10",
    well: "bg-neutral-500/20",
    name: "text-neutral-300",
    milestone: "bg-neutral-400",
  },
  scorpion: {
    bar: "bg-red-400",
    border: "border-red-500/40",
    wash: "bg-red-500/10",
    well: "bg-red-500/20",
    name: "text-red-300",
    milestone: "bg-red-400",
  },
  otter: {
    bar: "bg-green-400",
    border: "border-green-500/40",
    wash: "bg-green-500/10",
    well: "bg-green-500/20",
    name: "text-green-300",
    milestone: "bg-green-400",
  },
  chameleon: {
    bar: "bg-fuchsia-400",
    border: "border-fuchsia-500/45",
    wash: "bg-fuchsia-500/10",
    well: "bg-fuchsia-500/20",
    name: "text-fuchsia-300",
    milestone: "bg-fuchsia-400",
  },
  flamingo: {
    bar: "bg-pink-400",
    border: "border-pink-500/40",
    wash: "bg-pink-500/10",
    well: "bg-pink-500/20",
    name: "text-pink-300",
    milestone: "bg-pink-400",
  },
  octopus: {
    bar: "bg-violet-400",
    border: "border-violet-500/45",
    wash: "bg-violet-500/10",
    well: "bg-violet-500/20",
    name: "text-violet-300",
    milestone: "bg-violet-400",
  },
  squid: {
    bar: "bg-purple-400",
    border: "border-purple-500/45",
    wash: "bg-purple-500/10",
    well: "bg-purple-500/20",
    name: "text-purple-300",
    milestone: "bg-purple-400",
  },
  crab: {
    bar: "bg-gray-400",
    border: "border-gray-500/40",
    wash: "bg-gray-500/10",
    well: "bg-gray-500/20",
    name: "text-gray-300",
    milestone: "bg-gray-400",
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
/**
 * Theme colours for the allocation bar and its legend.
 *
 * These are `var(--cat-*)` references, not hex. The table used to be
 * eleven hardcoded Tailwind hex values (#a78bfa violet, #e879f9 fuchsia,
 * #818cf8 indigo, #f59e0b amber, plus cyan/sky/blue/teal/rose) — four of
 * them explicitly banned app-wide, all of them outside any token, and all
 * of them rendered as the widest strip of colour in the product. The ramp
 * they now point at is defined once in `globals.css` and documented in
 * DESIGN_TOKENS.md: one lightness, one chroma, hue only.
 *
 * Ordered so the themes that most often sit next to each other in a real
 * book (ai_infra / ai_power / semi are usually the three biggest slices)
 * land on well-separated hues rather than neighbours.
 */
export const THEME_COLOR: Record<ForecastTheme, string> = {
  ai_infra: "var(--cat-2)",
  ai_power: "var(--cat-3)",
  semi: "var(--cat-5)",
  crypto: "var(--cat-1)",
  space: "var(--cat-8)",
  fintech: "var(--cat-4)",
  software: "var(--cat-10)",
  healthcare: "var(--cat-6)",
  drones: "var(--cat-7)",
  index: "var(--cat-9)",
  other: "var(--cat-neutral)",
};

export const THEME_LABEL: Record<ForecastTheme, string> = {
  ai_infra: "AI computer builders",
  ai_power: "data-center power",
  crypto: "crypto",
  space: "space",
  semi: "chip makers",
  fintech: "payments and finance",
  software: "software",
  healthcare: "healthcare",
  // Covers the defense primes as well as pure drone/autonomy names, so
  // "drones" alone would mislabel a Lockheed or an RTX.
  drones: "defense and drones",
  index: "broad market funds",
  // Not "a mixed bag": this is the bucket for names the sector map doesn't
  // recognise, and as the label on a 51% slice it explained nothing.
  other: "other businesses",
};

function diversificationBandFor(score: number): ScoreBand {
  if (score < 25)
    return {
      label: "Concentrated",
      description: "A handful of names carry most of your portfolio.",
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
    description: "Index-fund-broad. No one name can wreck it.",
  };
}

function riskBandFor(score: number): ScoreBand {
  if (score < 30)
    return { label: "Conservative", description: "Calm mix. The names don't jump around much." };
  if (score < 55)
    return { label: "Balanced", description: "A mix of steady and speculative." };
  if (score < 75)
    return { label: "Aggressive", description: "Leans into names that swing hard." };
  return { label: "High-octane", description: "Most of the money sits in names that swing hard." };
}

function convictionBandFor(score: number): ScoreBand {
  if (score >= 50)
    return {
      label: "All-in",
      description: "One name is half the portfolio or more.",
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
    description: "Nothing dominates. The portfolio moves as a group.",
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

/** Which archetype id a heavily-concentrated (non-crypto, non-index) book
 * lands on, keyed by its dominant theme — so a book that's two-thirds AI
 * computer builders reads as a different animal than one that's two-thirds
 * chip makers, instead of every concentrated book becoming a generic
 * "Panda". Themes without an entry (currently just "other") fall back to
 * "panda" in pickAnimal. */
const CONCENTRATED_ANIMAL_BY_THEME: Partial<Record<ForecastTheme, string>> = {
  ai_infra: "beaver",
  ai_power: "rhino",
  semi: "badger",
  drones: "scorpion",
  fintech: "otter",
  software: "chameleon",
  healthcare: "flamingo",
};

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
      why: `Cash is ${cashPct}% of your portfolio. That stash is doing more work than any single ticker right now.`,
    };
  }
  if (theme === "crypto" && specialistScore >= 35) {
    return {
      archetype: archetype("dragon"),
      why: `Crypto is ${specialistScore}% of the stocks, and how jumpy is ${risk}/100. Nothing else in the field guide moves like that.`,
    };
  }
  if (
    specialistScore >= 68 &&
    theme !== "crypto" &&
    theme !== "index"
  ) {
    const id = CONCENTRATED_ANIMAL_BY_THEME[theme] ?? "panda";
    return {
      archetype: archetype(id),
      why: `${specialistScore}% of your portfolio sits in ${THEME_LABEL[theme]}. One diet, on purpose.`,
    };
  }
  if (themeCount >= 3) {
    if (risk >= 65) {
      return {
        archetype: archetype("squid"),
        why: `${themeCount} kinds of stocks across ${names}, and how jumpy ${risk}/100 is hot. Spread out and still fast-moving at the same time.`,
      };
    }
    if (diversification < 40) {
      return {
        archetype: archetype("crab"),
        why: `${themeCount} kinds of stocks across ${names}, but how spread out only ${diversification}/100. ${top} still carries most of it.`,
      };
    }
    return {
      archetype: archetype("octopus"),
      why: `${themeCount} kinds of stocks across ${names}. This is not one kind of business. It is a handful running side by side.`,
    };
  }
  if (
    risk >= 72 &&
    (conviction >= 38 || (diversification < 28 && positionCount <= 6))
  ) {
    return {
      archetype: archetype("shark"),
      why: `How jumpy ${risk}/100 with ${top}. Across ${names}, a couple of hot names decide almost everything.`,
    };
  }
  if (risk >= 72) {
    return {
      archetype: archetype("wolf"),
      why: `How jumpy ${risk}/100 is hot, but how spread out ${diversification}/100 across ${names} means no single name gets to decide the year.`,
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
      why: `How jumpy only ${risk}/100 and a short list (${top}). A few genuinely calm names.`,
    };
  }
  if (risk < 42 && diversification >= 40) {
    return {
      archetype: archetype("owl"),
      why: `How jumpy ${risk}/100 sits at the calm end, and how spread out ${diversification}/100 means the watching actually has breadth behind it.`,
    };
  }
  if (diversification >= 68 || (theme === "index" && specialistScore >= 50)) {
    return {
      archetype: archetype("elephant"),
      why: `How spread out ${diversification}/100 across ${names}. Spread this wide is hard to knock over.`,
    };
  }
  return {
    archetype: archetype("fox"),
    why: `How jumpy ${risk}/100, how spread out ${diversification}/100, ${themeCount} kinds of stocks, ${top}. Mid-table on every axis, which is its own kind of choice.`,
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
