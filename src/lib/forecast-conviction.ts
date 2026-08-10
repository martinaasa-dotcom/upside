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
  | "index"
  | "other";

export type ForecastStance = "bearish" | "base" | "bullish";

/**
 * BASE path as multiples of today's spot for EOY 2026…2030.
 * Sourced from Martin's sheet (white) — this is BASE, not bearish.
 */
const THEME_BASE_MULTS: Record<ForecastTheme, number[]> = {
  // NBIS/CRWV sheet shape: strong 2026 print, then S-curve (no winter)
  ai_infra: [1.3, 2.0, 2.85, 4.3, 6.0],
  // Datacenter power compounder (VST/PWR) — always above spot in 2026
  ai_power: [1.18, 1.55, 2.2, 3.1, 4.2],
  // BMNR sheet: rip → rip → winter → recover → expand
  crypto: [1.85, 2.9, 1.25, 2.0, 4.0],
  // RKLB sheet: grind up → digestion → re-accelerate
  space: [1.08, 1.57, 1.33, 1.99, 2.89],
  // HOOD/SOFI sheet-ish
  fintech: [1.35, 1.85, 1.2, 1.8, 2.7],
  software: [1.12, 1.4, 1.2, 1.75, 2.5],
  semi: [1.2, 1.7, 1.45, 2.4, 3.4],
  index: [1.08, 1.18, 1.12, 1.3, 1.45],
  other: [1.15, 1.5, 1.35, 1.9, 2.6],
};

/** Optional per-ticker BASE overrides (multiples of spot). */
const TICKER_BASE_MULTS: Record<string, number[]> = {
  NBIS: [1.33, 1.98, 2.71, 4.06, 5.63],
  CRWV: [1.26, 2.03, 2.97, 4.51, 6.37],
  RKLB: [1.08, 1.57, 1.33, 1.99, 2.89],
  BMNR: [1.84, 2.89, 1.26, 2.0, 3.95],
  VST: [1.2, 1.6, 2.3, 3.2, 4.3],
  PWR: [1.18, 1.55, 2.15, 3.0, 4.0],
  SOFI: [1.39, 1.78, 1.22, 1.94, 2.89],
  HOOD: [1.34, 1.88, 1.13, 1.61, 2.58],
  PLTR: [1.09, 1.34, 1.17, 1.73, 2.4],
  NOW: [1.16, 1.4, 1.2, 1.68, 2.24],
  NVDA: [1.22, 1.75, 1.5, 2.5, 3.6],
  AVGO: [1.18, 1.65, 1.4, 2.3, 3.3],
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
  if (["PLTR", "NOW", "GOOGL"].includes(base)) return "software";
  if (
    ["SPY", "CSPX", "VWCE", "SMH", "EX13", "JEDI"].includes(base) ||
    ticker.includes("=")
  ) {
    return "index";
  }
  if (/BTC|ETH|CRYPTO|MINE/.test(base)) return "crypto";
  if (/CLOUD|GPU|AI/.test(base)) return "ai_infra";
  return "other";
}

function baseMultsFor(ticker: string, theme: ForecastTheme): number[] {
  const key = ticker.split(".")[0]!.toUpperCase();
  return TICKER_BASE_MULTS[key] ?? THEME_BASE_MULTS[theme];
}

function roundPx(n: number) {
  return Math.round(n * 100) / 100;
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
    // Scale upside vs 1.0x spot so winters stay winters but magnitude shifts
    const scaledMult = 1 + (baseMult - 1) * scale;
    out[year] = roundPx(Math.max(0.01, spot * scaledMult));
  }
  return enforcePathRules(out, spot, theme, stance);
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
        ? spot * (stance === "bullish" ? 1.28 : 1.2)
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

Martin's spreadsheet is the **BASE** case. You MUST align BASE paths to that magnitude. **Bullish must be higher than base.** Bearish is the only stance allowed to be meaningfully softer.

### Canonical BASE anchors (scale to today's spot; keep the shape)
These are BASE — not "optimistic stretch":
- **NBIS**: ~1.33× / 2.0× / 2.7× / 4.1× / 5.6× spot by EOY 2026→2030 (e.g. ~192 → ~255 → ~380 → ~520 → ~780 → ~1080). NEVER print EOY 2026 below spot on base/bullish.
- **CRWV**: ~1.26× / 2.0× / 3.0× / 4.5× / 6.4× (e.g. ~91 → ~115 → ~185 → ~270 → ~410 → ~580).
- **RKLB**: ~1.08× / 1.57× / 1.33× / 2.0× / 2.9× with a 2028 digestion dip after 2027.
- **BMNR**: ~1.85× / 2.9× / 1.25× / 2.0× / 4.0× — 2026 UP hard, 2028 winter, then recover.
- **VST / PWR (AI power)**: treat like datacenter electricity compounders — 2026 above spot, ~3–4.5× by 2030 on base.
- **HOOD / SOFI / PLTR / NOW**: follow the same sheet style (up years + one mid-path washout).

### Stance mapping (strict)
- **base**: Match the anchors above (±15% OK). This is the default conviction book.
- **bullish**: Same shape, **materially higher** than base (~+25–40% on terminals; 2026 still above base 2026).
- **bearish**: Softer terminals (~45–60% of base upside) with deeper winters — still non-linear.

### Forbidden
- EOY 2026 **below spot** for NBIS, CRWV, VST, PWR, BMNR on **base or bullish**. That is a failure (your 182-on-NBIS bug).
- Near-linear ramps (same $ or YoY for 3+ years).
- Timid mid-single-digit paths on AI infra / crypto when stance is base or bullish.
- Making "base" quieter than the spreadsheet.

### Required dynamics
- Non-linear paths: bull runs and/or consolidation years.
- Crypto: violent mid-path winter, then recovery.
- AI infra: digestion = slower UP year, not a collapse below spot early.
- New tickers: classify to nearest theme and use that theme's BASE multiples.

### Rationale
One sentence naming dynamics + why the 2026 print is above spot (for base/bullish leaders).`;
