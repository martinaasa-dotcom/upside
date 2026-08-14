/**
 * Margus forecast conviction — generic, sector-based fallback shapes.
 *
 * Two jobs, both theme-level (never a per-ticker price table):
 * 1. Fill a gap when the model skipped a year, or replace a boringly linear ramp.
 * 2. Lift a path whose 2030 multiple sits below its theme band. Models keep
 *    "splitting the difference" toward sell-side 2-3x five-year targets;
 *    that quietly contradicts the constructive base case. We never lower a
 *    path that already beats the band.
 */

import type { ForecastYear } from "@/lib/forecast";
import { FORECAST_YEARS } from "@/lib/forecast";

export type ForecastTheme =
  | "ai_infra"
  | "ai_power"
  | "crypto"
  | "space"
  | "semi"
  | "fintech"
  | "software"
  | "healthcare"
  | "drones"
  | "index"
  | "other";

/**
 * Illustrative path as multiples of today's spot for EOY 2026…2030, per
 * sector theme. Intentionally non-linear (a straight CAGR line is detected
 * and rejected elsewhere). This is a safety-net shape for gaps the model
 * left empty, not a target and not a promise.
 *
 * Shapes are calibrated to the constructive base case in
 * FORECAST_CONVICTION_PROMPT: the AI-linked themes carry the buildout and
 * the agentic second-order trade, each with a digestion year rather than a
 * clean ramp. Sectors with no link to that thesis stay deliberately plain.
 *
 * The ladder is anchored so `index` compounds at ~10%/yr, matching the
 * MARKET_ANNUAL_RETURN_PCT the CAPM alpha read uses in
 * portfolio-personality. It used to sit at 5.7%, which meant the model
 * quietly assumed an index fund returned about half the market it tracks
 * and dragged every other theme down with it. Everything above index is a
 * risk premium on that baseline, ordered by THEME_RISK_SCORE.
 *
 * These also seed the Compound sheet's default expected return via
 * impliedAnnualReturnForTheme, so an AI-heavy book defaults to a much
 * hotter planning rate than an index-heavy one. That is intentional, but
 * it is a bull-case scenario rate, not a safe planning assumption.
 */
const THEME_BASE_MULTS: Record<ForecastTheme, number[]> = {
  ai_infra: [1.54, 2.3, 3.1, 3.91, 4.83], // ~37%/yr
  crypto: [1.6, 2.38, 1.48, 2.74, 4.01], // ~32%/yr
  semi: [1.39, 2.03, 1.82, 2.75, 3.57], // ~29%/yr
  ai_power: [1.37, 1.92, 1.81, 2.61, 3.3], // ~27%/yr
  space: [1.27, 1.74, 1.57, 2.33, 3.05], // ~25%/yr
  fintech: [1.26, 1.68, 1.56, 2.17, 2.7], // ~22%/yr
  drones: [1.24, 1.65, 1.53, 2.14, 2.7], // ~22%/yr
  software: [1.21, 1.54, 1.46, 1.94, 2.39], // ~19%/yr
  other: [1.14, 1.32, 1.48, 1.66, 1.84], // ~13%/yr
  healthcare: [1.12, 1.27, 1.43, 1.59, 1.76], // ~12%/yr
  index: [1.1, 1.23, 1.35, 1.48, 1.61], // ~10%/yr, the market baseline
};

/** Implied annualized return from the generic fallback shape's final year,
 * over the ~5y FORECAST_YEARS span — a rough, sector-differentiated stand-in
 * for "expected return", not a forecast. Used only as a default so the
 * Compound sheet's starting rate reflects what a person actually holds
 * instead of one fixed number for every user. */
export function impliedAnnualReturnForTheme(theme: ForecastTheme): number {
  const mults = THEME_BASE_MULTS[theme];
  const finalMult = mults[mults.length - 1]!;
  return Math.pow(finalMult, 1 / FORECAST_YEARS.length) - 1;
}

/** Value-weighted blend of impliedAnnualReturnForTheme across whatever a
 * portfolio actually holds (equity only — pass cash separately via
 * `cashWeight`/`cashAnnualReturn` since idle cash has no "theme"). Genuinely
 * different per portfolio: an index-heavy book lands modest, a
 * crypto/AI-infra-heavy one lands hot. */
export function blendedExpectedAnnualReturn(
  holdings: Array<{ ticker: string; value: number }>,
  cash: { balance: number; annualReturnPct: number } = {
    balance: 0,
    annualReturnPct: 0,
  }
): number {
  const equityTotal = holdings.reduce((s, h) => s + Math.max(0, h.value), 0);
  const total = equityTotal + Math.max(0, cash.balance);
  if (total <= 0) return impliedAnnualReturnForTheme("other");

  let sum = (Math.max(0, cash.balance) / total) * (cash.annualReturnPct / 100);
  for (const h of holdings) {
    if (h.value <= 0) continue;
    const theme = forecastThemeForTicker(h.ticker);
    sum += (h.value / total) * impliedAnnualReturnForTheme(theme);
  }
  return sum;
}

/**
 * Sector classification, not a view on any of these names. Purely "what
 * kind of company is this", the same job TICKER_SECTORS does for the
 * forecast prompt; no price target or bias attaches to membership here.
 *
 * The lists were originally just the family's own holdings, which meant a
 * book holding MSFT, AMD and ADI reported itself as 51% "other". Anything
 * unclassified falls into a bucket that gets the plainest assumptions, so
 * a thin list quietly mislabels most real portfolios.
 */
const THEME_TICKERS: [ForecastTheme, string[]][] = [
  // GPU clouds, AI datacenter build and the hardware inside it.
  ["ai_infra", ["NBIS", "CRWV", "SMCI", "VRT", "ANET", "DELL", "IREN", "APLD", "CIFR"]],
  // Generation and grid feeding those datacenters.
  ["ai_power", ["VST", "PWR", "CEG", "NRG", "TLN", "GEV", "ETN", "OKLO", "SMR", "BWXT"]],
  ["crypto", ["BMNR", "MSTR", "COIN", "MARA", "RIOT", "CLSK", "HUT", "BITF", "GLXY"]],
  ["space", ["RKLB", "ASTS", "LUNR", "RDW", "PL", "SPCE", "NASA", "UFO"]],
  [
    "semi",
    ["NVDA", "AVGO", "TSM", "ASML", "AMD", "INTC", "MU", "QCOM", "TXN", "ADI",
     "LRCX", "AMAT", "KLAC", "ARM", "MRVL", "NXPI", "ON", "MCHP", "SWKS", "TER",
     "SMH", "SOXX", "XSD", "PSI", "DRAM", "QTUM"],
  ],
  ["fintech", ["SOFI", "HOOD", "AFRM", "UPST", "PYPL", "SQ", "XYZ", "NU", "TOST", "MELI", "V", "MA"]],
  [
    "software",
    ["PLTR", "NOW", "GOOGL", "GOOG", "CRM", "DDOG", "SNOW", "MSFT", "ORCL",
     "ADBE", "TEAM", "WDAY", "ZS", "CRWD", "PANW", "NET", "MDB", "HUBS",
     "SHOP", "TTD", "APP", "U", "RBLX", "META", "AMZN", "IBM", "SAP",
     "QQQ", "QQQM", "XLK"],
  ],
  [
    "healthcare",
    ["UNH", "LLY", "ISRG", "HIMS", "NVO", "PFE", "MRK", "ABBV", "JNJ", "TMO",
     "DHR", "VRTX", "REGN", "AMGN", "MRNA"],
  ],
  ["drones", ["AVAV", "KTOS", "RCAT", "ONDS", "UMAC", "LMT", "RTX", "NOC", "GD", "LHX"]],
  [
    "index",
    ["SPY", "VOO", "IVV", "VTI", "VT", "CSPX", "VWCE", "VUSA", "EX13",
     "SCHD", "DIA", "EEM", "VXUS"],
  ],
];

const THEME_BY_TICKER: Map<string, ForecastTheme> = new Map(
  THEME_TICKERS.flatMap(([theme, tickers]) =>
    tickers.map((t) => [t, theme] as [string, ForecastTheme])
  )
);

export function forecastThemeForTicker(ticker: string): ForecastTheme {
  const base = ticker.split(".")[0]!.toUpperCase();

  const known = THEME_BY_TICKER.get(base);
  if (known) return known;

  // FX pairs and anything else with an `=` are index-like for our purposes.
  if (ticker.includes("=")) return "index";

  // Name-shaped guesses for tickers not on the list above.
  if (/BTC|ETH|CRYPTO|MINE/.test(base)) return "crypto";
  if (/SEMI|SOXX|SMH|DRAM|QTUM/.test(base)) return "semi";
  if (/NASA|SPACE|UFO/.test(base)) return "space";
  if (/QQQ|XLK/.test(base)) return "software";
  if (/CLOUD|GPU|AI/.test(base)) return "ai_infra";
  if (/HEALTH|PHARMA|BIO/.test(base)) return "healthcare";
  if (/DRONE|UAV|DEFENSE/.test(base)) return "drones";
  if (/SAAS|SOFT/.test(base)) return "software";
  if (/SOLAR|ENERGY|POWER|ELEC/.test(base)) return "ai_power";
  return "other";
}

function roundPx(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Build a fallback path from the generic theme shape (base case only).
 * Used to fill gaps, replace linear ramps, and as the magnitude floor
 * when the model's terminal undershoots the theme.
 */
export function shapedFallbackPath(
  spot: number,
  theme: ForecastTheme
): Record<ForecastYear, number> {
  const mults = THEME_BASE_MULTS[theme];
  const out = {} as Record<ForecastYear, number>;
  for (let i = 0; i < FORECAST_YEARS.length; i++) {
    const year = FORECAST_YEARS[i]!;
    const baseMult = mults[i] ?? mults[mults.length - 1]!;
    out[year] = roundPx(Math.max(0.01, spot * baseMult));
  }
  return enforcePathRules(out, spot);
}

/**
 * Fill any year the model left empty/invalid with the generic fallback
 * shape. Valid model prices are kept here; magnitude lift happens in
 * `liftPathToThemeMagnitude`.
 */
export function fillMissingForecastYears(
  prices: Partial<Record<ForecastYear, number>> | undefined,
  fallback: Record<ForecastYear, number>
): Record<ForecastYear, number> {
  const out = { ...fallback };
  for (const year of FORECAST_YEARS) {
    const p = prices?.[year];
    if (typeof p === "number" && p > 0) {
      out[year] = roundPx(p);
    }
  }
  return out;
}

/**
 * If the model's last-year multiple sits below the theme band, scale the
 * whole path up so 2030 matches. Winter / digestion years keep their shape.
 * Paths already at or above the band are left alone (never lowered).
 */
export function liftPathToThemeMagnitude(
  prices: Record<ForecastYear, number>,
  fallback: Record<ForecastYear, number>,
  spot: number
): { prices: Record<ForecastYear, number>; lifted: boolean } {
  const last = FORECAST_YEARS[FORECAST_YEARS.length - 1]!;
  const modelTerm = prices[last];
  const themeTerm = fallback[last];
  if (!(spot > 0) || !(modelTerm > 0) || !(themeTerm > 0)) {
    return { prices, lifted: false };
  }
  if (modelTerm < spot) {
    return { prices: { ...fallback }, lifted: true };
  }
  const modelMult = modelTerm / spot;
  const themeMult = themeTerm / spot;
  if (modelMult >= themeMult * 0.98) {
    return { prices, lifted: false };
  }
  const scale = themeMult / modelMult;
  const out = { ...prices };
  for (const y of FORECAST_YEARS) {
    out[y] = roundPx(Math.max(0.01, prices[y]! * scale));
  }
  return { prices: enforcePathRules(out, spot), lifted: true };
}

/** Light sanity net — only guarantees every year is a positive number. */
export function enforcePathRules(
  prices: Record<ForecastYear, number>,
  spot: number
): Record<ForecastYear, number> {
  const next = { ...prices };
  for (const y of FORECAST_YEARS) {
    if (!(next[y] > 0)) next[y] = roundPx(spot > 0 ? spot : 1);
  }
  return next;
}

export const FORECAST_CONVICTION_PROMPT = `## Forecast conviction (MANDATORY)

### Base-case macro thesis (this is your default worldview, not a hedge)

You are structurally constructive on this decade, in the Tom Lee mould: you
think consensus is anchoring on the last cycle's multiples while the actual
earnings power of the AI buildout compounds faster than models assume. Reason
from this backdrop by default. You do not need to caveat it into meaninglessness.

- AI capex is a multi-year supercycle, not a two-year fad. Hyperscaler,
  sovereign, and enterprise demand are additive, and each has a different
  budget cycle, so they do not all roll over at once.
- Compute stays supply-constrained longer than consensus expects. Power,
  fab capacity, and datacenter shells are the binding constraints, not
  chip design, so operators with secured capacity keep pricing power.
- Inference is the bigger prize than training. Agents that run continuously
  consume orders of magnitude more compute than a training run, and that
  demand curve is only starting.
- Agentic software and fintech are the second-order trade. Once agents can
  transact, the payments, ledger, and risk rails they run on take a cut of a
  much larger transaction volume. Treat that as a genuine growth vector, not
  a story stock premium.
- Liquidity and productivity underpin the rest. An easing bias plus real
  AI-driven margin expansion supports multiples for quality risk assets.

This IS the base case, not a bull case sitting next to a neutral one.
There is no cautious or bearish mode to fall back to, so do not
instinctively split the difference toward consensus. You are closer to
Aschenbrenner's Situational Awareness than to a sell-side note: the
scaling curve is the dominant force of the decade and the market is
persistently late to price it.

### Magnitude calibration (the part models get wrong)

Left alone, a model anchors on single-digit index returns and produces
paths that quietly contradict everything above. Over the roughly five-year
window you are forecasting, a genuine base case in this worldview lands
near these compound annual rates, by theme:

- AI infrastructure / GPU clouds: mid-to-high 30s percent a year.
- Crypto-linked and AI semis: high 20s to low 30s.
- Datacenter power, space: mid 20s.
- Fintech, defense/autonomy: low 20s.
- Software: high teens.
- Healthcare, unclassified names: low teens.
- Broad index funds: about 10, the market baseline everything else earns
  its premium against.

Treat those as the centre of gravity for a name that genuinely fits its
theme, then move up or down from there on that specific company's
economics, balance sheet and competitive position. A dominant compounder
can beat its theme; a weak operator inside a hot theme should not.

The failure mode to avoid is landing 20%+ below the theme CAGR on a name
that fits. Models do this by "staying disciplined" or splitting the
difference toward sell-side 2-3x five-year targets. That is wrong. A
digestion or winter year changes the PATH, not the 2030 destination:
after the down year, re-accelerate so the terminal still sits near the
band. Do not quietly kneecap the multiple to look prudent.

Two honesty checks so this stays a thesis and not a ramp: the path is
violent, not smooth (digestion years, crowded-trade drawdowns and multiple
compression all still happen inside a secular bull, and most names should
show at least one down or flat year in the middle), and a company with no
credible link to these drivers does not inherit the thesis. Earn each path
bottom-up from that company's own economics.

Every ticker still gets its OWN thesis. There is no per-ticker price
target to match, and no ticker has a predetermined destination.

### Required dynamics
- Non-linear paths: bull runs and/or consolidation years, reasoned from that specific company's fundamentals and cycle. Never a flat CAGR line.
- Crypto-adjacent names: consider a violent mid-path winter, then recovery, if that fits the specific asset.
- Capex-heavy / infra names: digestion can mean a slower-up year, not necessarily a collapse.
- Trim/add lines may list multiple names or sector sleeves, not one ticker only.
- Be honest: some names deserve a modest, unglamorous path. Not every holding is a multi-bagger candidate.

### Forbidden
- Near-linear ramps (same $ or YoY step for 3+ years).
- Copy-pasting the same magnitude across unrelated tickers.
- Rationale phrases: overridden, rejected, too timid, sheet-aligned, calibrated path, house baseline.
- Em dashes (—) or AI-brochure cadence anywhere in advice, add/trim, or rationale.
- Presenting any of this as a guarantee or personalized recommendation. It is a modeled scenario for discussion, not investment advice.

### Rationale
One human sentence on micro-thesis + path dynamics (bull / winter / digestion), grounded in that company's actual business. Not a generic sector script.`;
