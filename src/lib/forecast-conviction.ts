/**
 * Margus forecast conviction — Martin's spreadsheet is the BASE case.
 * Bullish must sit above base; bearish below. Never timid 2026 dips on AI infra.
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

export type ForecastStance = "bearish" | "base" | "bullish";

/** Tickers with explicit BASE CASE rows on Martin's white sheet. */
export const HOUSE_SHEET_TICKERS = [
  "NBIS",
  "CRWV",
  "RKLB",
  "BMNR",
  "SOFI",
  "HOOD",
  "PLTR",
  "NOW",
  "VST",
] as const;

/**
 * BASE path as multiples of today's spot for EOY 2026…2030.
 * Sheet-listed tickers use exact white-sheet ratios; themes use the same bullish mix.
 */
const THEME_BASE_MULTS: Record<ForecastTheme, number[]> = {
  // NBIS + CRWV sheet average — high-conviction AI infra
  ai_infra: [1.347, 2.084, 2.947, 4.449, 6.231],
  ai_power: [1.316, 1.785, 2.379, 2.974, 3.569],
  crypto: [1.944, 3.056, 1.333, 2.111, 4.167],
  space: [1.125, 1.625, 1.375, 2.063, 3.0],
  fintech: [1.353, 1.81, 1.164, 1.762, 2.708],
  software: [1.128, 1.375, 1.191, 1.713, 2.331],
  healthcare: [1.12, 1.4, 1.22, 1.75, 2.35],
  drones: [1.2, 1.7, 1.4, 2.1, 3.0],
  semi: [1.25, 1.85, 1.5, 2.45, 3.5],
  index: [1.08, 1.18, 1.12, 1.3, 1.45],
  other: [1.25, 1.75, 1.4, 2.05, 2.9],
};

/**
 * Exact BASE CASE TARGETS from Martin's sheet (multiples of spot).
 * Reference spots when sheet was authored: NBIS ~184, CRWV ~88, RKLB ~80, BMNR ~18, etc.
 */
const TICKER_BASE_MULTS: Record<string, number[]> = {
  NBIS: [1.386, 2.065, 2.826, 4.239, 5.87],
  CRWV: [1.307, 2.102, 3.068, 4.659, 6.591],
  RKLB: [1.125, 1.625, 1.375, 2.063, 3.0],
  BMNR: [1.944, 3.056, 1.333, 2.111, 4.167],
  VST: [1.316, 1.785, 2.379, 2.974, 3.569],
  SOFI: [1.389, 1.778, 1.222, 1.944, 2.889],
  HOOD: [1.316, 1.842, 1.105, 1.579, 2.526],
  PLTR: [1.114, 1.371, 1.2, 1.771, 2.457],
  NOW: [1.142, 1.378, 1.181, 1.654, 2.205],
  PWR: [1.316, 1.785, 2.379, 2.974, 3.569],
  NVDA: [1.25, 1.85, 1.5, 2.45, 3.5],
  AVGO: [1.22, 1.75, 1.45, 2.35, 3.35],
};

/** Scale whole path vs BASE (bullish above, bearish below). */
const STANCE_PATH_SCALE: Record<ForecastStance, number> = {
  bearish: 0.55,
  base: 1,
  bullish: 1.28,
};

export function forecastThemeForTicker(ticker: string): ForecastTheme {
  const base = ticker.split(".")[0]!.toUpperCase();

  if (["NBIS", "CRWV"].includes(base)) return "ai_infra";
  if (["VST", "PWR"].includes(base)) return "ai_power";
  if (["BMNR", "MSTR", "COIN", "MARA", "RIOT"].includes(base)) return "crypto";
  if (["RKLB"].includes(base)) return "space";
  if (["NVDA", "AVGO", "TSM", "ASML"].includes(base)) return "semi";
  if (["HOOD", "SOFI"].includes(base)) return "fintech";
  if (["PLTR", "NOW", "GOOGL", "CRM", "DDOG", "SNOW"].includes(base))
    return "software";
  if (["UNH", "LLY", "ISRG", "HIMS"].includes(base)) return "healthcare";
  if (["AVAV", "KTOS", "RCAT"].includes(base)) return "drones";
  if (
    ["SPY", "CSPX", "VWCE", "SMH", "EX13", "JEDI"].includes(base) ||
    ticker.includes("=")
  ) {
    return "index";
  }
  if (/BTC|ETH|CRYPTO|MINE/.test(base)) return "crypto";
  if (/CLOUD|GPU|AI/.test(base)) return "ai_infra";
  if (/HEALTH|PHARMA|BIO/.test(base)) return "healthcare";
  if (/DRONE|UAV|DEFENSE/.test(base)) return "drones";
  if (/SAAS|SOFT/.test(base)) return "software";
  return "other";
}

function baseMultsFor(ticker: string, theme: ForecastTheme): number[] {
  const key = ticker.split(".")[0]!.toUpperCase();
  return TICKER_BASE_MULTS[key] ?? THEME_BASE_MULTS[theme];
}

function roundPx(n: number) {
  return Math.round(n * 100) / 100;
}

export function isHouseSheetTicker(ticker: string): boolean {
  const key = ticker.split(".")[0]!.toUpperCase();
  return (HOUSE_SHEET_TICKERS as readonly string[]).includes(key);
}

/**
 * Build a stance-scaled path from the BASE spreadsheet calibration.
 * Bullish > base > bearish. Keeps relative shape (including crypto winter).
 */
export function shapedFallbackPath(
  spot: number,
  theme: ForecastTheme,
  stance: ForecastStance,
  ticker?: string
): Record<ForecastYear, number> {
  const mults = baseMultsFor(ticker ?? "", theme);
  const scale = STANCE_PATH_SCALE[stance];
  const out = {} as Record<ForecastYear, number>;
  for (let i = 0; i < FORECAST_YEARS.length; i++) {
    const year = FORECAST_YEARS[i]!;
    const baseMult = mults[i] ?? mults[mults.length - 1]!;
    const scaledMult = 1 + (baseMult - 1) * scale;
    out[year] = roundPx(Math.max(0.01, spot * scaledMult));
  }
  return enforcePathRules(out, spot, theme, stance);
}

/** Margus/LLM prices can exceed sheet BASE — never fall below it on base stance. */
export function mergeWithHouseBaseFloors(
  prices: Partial<Record<ForecastYear, number>> | undefined,
  floor: Record<ForecastYear, number>,
  stance: ForecastStance = "base"
): Record<ForecastYear, number> {
  const out = { ...floor };
  if (stance === "bearish") return out;
  for (const year of FORECAST_YEARS) {
    const p = prices?.[year];
    if (typeof p === "number" && p > 0) {
      out[year] = roundPx(Math.max(p, floor[year]!));
    }
  }
  return out;
}

/** Hard rules so BASE/BULLISH never open with nonsense dips on AI infra. */
export function enforcePathRules(
  prices: Record<ForecastYear, number>,
  spot: number,
  theme: ForecastTheme,
  stance: ForecastStance
): Record<ForecastYear, number> {
  const next = { ...prices };
  const y2026 = FORECAST_YEARS[0]!;

  if (stance === "base" || stance === "bullish") {
    const min2026 =
      theme === "ai_infra"
        ? spot * (stance === "bullish" ? 1.28 : 1.25)
        : theme === "ai_power"
          ? spot * (stance === "bullish" ? 1.18 : 1.12)
          : theme === "crypto"
            ? spot * (stance === "bullish" ? 1.6 : 1.4)
            : theme === "space"
              ? spot * 1.05
              : theme === "index"
                ? spot * 1.03
                : spot * 1.08;

    if (!(next[y2026] > 0) || next[y2026]! < min2026) {
      next[y2026] = roundPx(min2026);
    }
  }

  for (const y of FORECAST_YEARS) {
    if (!(next[y] > 0)) next[y] = roundPx(spot * 1.05);
  }
  return next;
}

export const FORECAST_CONVICTION_PROMPT = `## Forecast conviction (MANDATORY)

Macro backdrop: Tom Lee–style (liquidity + AI spend + crypto institutionalization) — structurally supportive for risk assets. Use that environment; do **not** copy Lee’s permabull extremes on every ticker/year. Paths stay non-linear.

Martin's white spreadsheet **BASE CASE TARGETS** are the floor (always — house path, no stance toggle). You MUST align paths to that magnitude. **Never print an EOY below the sheet BASE for a listed ticker.** Other names use the same bullish theme assumptions.

### Canonical BASE floors (scale to today's spot; keep the shape)
These are minimums — Margus may go higher, never lower:
- **NBIS** @ ~$184: **255 / 380 / 520 / 780 / 1080** by EOY 2026→2030 (587% gain path). NEVER below spot in 2026.
- **CRWV** @ ~$88: **115 / 185 / 270 / 410 / 580**.
- **RKLB** @ ~$80: **90 / 130 / 110 / 165 / 240** (2028 digestion).
- **BMNR** @ ~$18: **35 / 55 / 24 / 38 / 75** (2028 winter).
- **VST** (AI power): same compounder spirit — **~1.32× / 1.79× / 2.38× / 2.97× / 3.57×** spot by 2030.
- **SOFI / HOOD / PLTR / NOW**: sheet-listed — match their non-linear shapes when present.
- **New tickers**: classify to nearest theme (AI infra, crypto, space, fintech, SaaS…) and use that theme's BASE multiples — same overall bullish sentiment.

### Forbidden
- Any EOY **below** the spreadsheet BASE for sheet-listed tickers (CRWV 2030 at 410 when BASE is ~580 is a failure).
- EOY 2026 **below spot** for NBIS, CRWV, VST, PWR, BMNR.
- Near-linear ramps (same $ or YoY for 3+ years).
- Timid mid-single-digit paths on AI infra / crypto.
- Making paths quieter than the spreadsheet.
- Rationale phrases: overridden, rejected, too timid, sheet-aligned, calibrated path.

### Required dynamics
- Non-linear paths: bull runs and/or consolidation years.
- Crypto: violent mid-path winter, then recovery.
- AI infra: digestion = slower UP year, not a collapse below spot early.
- Trim/add lines may list multiple names or sector sleeves — not one ticker only.

### Rationale
One human sentence on micro-thesis + path dynamics (bull / winter / digestion). Never say overridden or rejected.`;
