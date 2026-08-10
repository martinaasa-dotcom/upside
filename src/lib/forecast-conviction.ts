/**
 * Margus forecast conviction — magnitude + path-shape rules.
 * Not hard price targets: thematic multiples and forbidden linear ramps.
 * Calibrated to Martin’s bullish datacenter / crypto sheet (NBIS/CRWV/BMNR class).
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
  | "index"
  | "other";

/** Bullish ~2030 multiple vs spot (mid of band used for fallback shaping). */
export const THEME_BULLISH_2030: Record<
  ForecastTheme,
  { lo: number; mid: number; hi: number; note: string }
> = {
  ai_infra: {
    lo: 4,
    mid: 5.5,
    hi: 8,
    note: "NBIS/CRWV-class neo-cloud — structural S-curve, multi-bagger",
  },
  ai_power: {
    lo: 2.5,
    mid: 3.5,
    hi: 5,
    note: "VST/PWR datacenter power — AI electricity demand compounder",
  },
  crypto: {
    lo: 3,
    mid: 4.5,
    hi: 7,
    note: "BMNR/MSTR-class — cycle with winter, then explosive recovery",
  },
  space: {
    lo: 2,
    mid: 3,
    hi: 4,
    note: "RKLB-class — execution + digestion years",
  },
  semi: {
    lo: 2.2,
    mid: 3.2,
    hi: 4.5,
    note: "NVDA/AVGO/ASML — AI capex cycle with digestion",
  },
  fintech: {
    lo: 2,
    mid: 3,
    hi: 4,
    note: "HOOD/SOFI — risk-on beta with washout years",
  },
  software: {
    lo: 2,
    mid: 2.8,
    hi: 4,
    note: "PLTR/NOW — adoption + multiple expansion, not straight line",
  },
  index: {
    lo: 1.25,
    mid: 1.45,
    hi: 1.7,
    note: "Broad beta — modest with mild cyclicality",
  },
  other: {
    lo: 1.6,
    mid: 2.2,
    hi: 3,
    note: "Default growth — thesis-driven, non-linear",
  },
};

export function forecastThemeForTicker(ticker: string): ForecastTheme {
  const base = ticker.split(".")[0]!.toUpperCase();

  if (["NBIS", "CRWV"].includes(base)) return "ai_infra";
  if (["VST", "PWR"].includes(base)) return "ai_power";
  if (["BMNR", "MSTR", "COIN", "MARA", "RIOT"].includes(base)) return "crypto";
  if (["RKLB"].includes(base)) return "space";
  if (["NVDA", "AVGO", "TSM", "ASML"].includes(base)) return "semi";
  if (["HOOD", "SOFI"].includes(base)) return "fintech";
  if (["PLTR", "NOW", "GOOGL"].includes(base)) return "software";
  if (
    ["SPY", "CSPX", "VWCE", "SMH", "EX13", "JEDI"].includes(base) ||
    ticker.includes("=")
  ) {
    return "index";
  }

  // Soft heuristics for unknown / new tickers
  if (/BTC|ETH|CRYPTO|MINE/.test(base)) return "crypto";
  if (/CLOUD|GPU|AI/.test(base)) return "ai_infra";
  return "other";
}

/**
 * Non-linear path shapes as fractions of the 2030 terminal multiple progress.
 * Index year 0 = EOY 2026 … 4 = EOY 2030.
 */
const SHAPES: Record<ForecastTheme, number[]> = {
  // Aggressive compound, no winter — NBIS/CRWV sheet shape
  ai_infra: [0.18, 0.38, 0.55, 0.78, 1],
  // Steady AI-power compounder with mild mid-path digestion
  ai_power: [0.2, 0.4, 0.52, 0.75, 1],
  // Explosive → winter → recovery (BMNR sheet: peak then brutal 2028)
  crypto: [0.35, 0.55, 0.12, 0.28, 1],
  // Mild early, digestion, then re-acceleration (RKLB sheet)
  space: [0.12, 0.45, 0.28, 0.55, 1],
  semi: [0.22, 0.42, 0.35, 0.7, 1],
  fintech: [0.28, 0.5, 0.18, 0.45, 1],
  software: [0.2, 0.4, 0.32, 0.65, 1],
  index: [0.2, 0.4, 0.55, 0.78, 1],
  other: [0.2, 0.4, 0.35, 0.7, 1],
};

const STANCE_SCALE = {
  bearish: 0.35,
  base: 0.72,
  bullish: 1,
} as const;

/** Last-resort non-linear fill when the model omits a year — never flat CAGR. */
export function shapedFallbackPath(
  spot: number,
  theme: ForecastTheme,
  stance: "bearish" | "base" | "bullish"
): Record<ForecastYear, number> {
  const band = THEME_BULLISH_2030[theme];
  const scale = STANCE_SCALE[stance];
  const terminalMult = 1 + (band.mid - 1) * scale;
  const shape = SHAPES[theme];
  const out = {} as Record<ForecastYear, number>;
  for (let i = 0; i < FORECAST_YEARS.length; i++) {
    const year = FORECAST_YEARS[i]!;
    const frac = shape[i] ?? 1;
    const mult = 1 + (terminalMult - 1) * frac;
    out[year] = Math.round(spot * mult * 100) / 100;
  }
  return out;
}

export const FORECAST_CONVICTION_PROMPT = `## Forecast conviction (MANDATORY)

You are NOT a sell-side "base case" robot. For Upside, **bullish structural theses are the default** on AI infra, datacenter power, and crypto — unless the micro-thesis is clearly broken.

### Forbidden
- Near-linear ramps (same $ step or same YoY % for 3+ years). That is a failure.
- Timid mid-single-digit CAGR on NBIS/CRWV/VST/PWR/BMNR-class names when stance is base or bullish.
- Flat-copying spot into every year (except cash-like instruments — say so).

### Required path dynamics
- Every single-stock path must show **market dynamics**: at least one acceleration / bull-run year AND/OR one consolidation / drawdown year in 2026–2030.
- Name the why in \`rationale\` (halving/liquidity, capex digestion, S-curve adoption, execution miss, etc.).

### Magnitude calibration (bullish stance ≈ these multiples by EOY 2030 vs today's spot)
Use as **conviction size**, then reason prices from each company's thesis — do not invent a different timid universe:
- **AI infra / neo-cloud** (NBIS, CRWV, GPU cloud peers): ~4–8× spot by 2030; can stay structurally up without a fake "mean-reversion" winter. Digestion = slower up year, not a collapse, unless thesis breaks.
- **AI power / datacenter electricity** (VST, PWR): ~2.5–5× — power is the bottleneck for AI buildout.
- **Crypto / BTC treasury** (BMNR, MSTR, miners, COIN): ~3–7× by 2030 **with a violent mid-path winter** (often −40% to −60% from the prior EOY peak in one year), then recovery. Model the cycle — not a straight line.
- **Space / aerospace** (RKLB): ~2–4× with at least one digestion year.
- **Semis / AI chips**: strong compounding with occasional capex-digestion flat/down year.
- **Fintech / speculative software**: risk-on multiples with washout years allowed.
- **Index / ETF**: modest only (~1.3–1.7×), mild cyclicality.

### New tickers
When a new name appears, classify it into the nearest theme above and apply that magnitude + path shape. Same rules forever — no special-case shy forecasts.

### Stance mapping
- **bullish**: hit the calibration bands above.
- **base**: still thesis-bullish on AI/crypto/power — about ~70% of bullish terminal multiples, still non-linear with real ups/downs.
- **bearish**: slower terminals (~35% of bullish upside) but STILL non-linear; deeper drawdowns OK; do not go flat-linear.`;
