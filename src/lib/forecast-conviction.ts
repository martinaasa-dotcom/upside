/**
 * Margus forecast conviction — generic, sector-based fallback shapes.
 *
 * These fill in a gap ONLY when the model didn't produce a usable price for
 * a given ticker/year, or produced a suspiciously flat/linear path. They are
 * intentionally modest, illustrative curves, not a promise or a target —
 * every real forecast is reasoned per-ticker by the model, not assigned from
 * a fixed lookup table.
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

/**
 * Modest illustrative path as multiples of today's spot for EOY 2026…2030,
 * per sector theme. Intentionally non-linear (a straight CAGR line is
 * detected and rejected elsewhere) but NOT an aggressive return promise —
 * this is a safety-net shape, not house guidance.
 */
const THEME_BASE_MULTS: Record<ForecastTheme, number[]> = {
  ai_infra: [1.15, 1.35, 1.55, 1.85, 2.2],
  ai_power: [1.12, 1.28, 1.45, 1.68, 1.95],
  crypto: [1.3, 1.6, 1.1, 1.5, 2.0],
  space: [1.1, 1.3, 1.2, 1.5, 1.9],
  fintech: [1.12, 1.3, 1.15, 1.45, 1.8],
  software: [1.1, 1.25, 1.15, 1.4, 1.7],
  healthcare: [1.08, 1.2, 1.12, 1.35, 1.6],
  drones: [1.1, 1.3, 1.2, 1.5, 1.9],
  semi: [1.15, 1.35, 1.25, 1.6, 2.0],
  index: [1.06, 1.13, 1.1, 1.2, 1.32],
  other: [1.1, 1.25, 1.15, 1.45, 1.75],
};

/** Scale whole path vs BASE (bullish above, bearish below). */
const STANCE_PATH_SCALE: Record<ForecastStance, number> = {
  bearish: 0.6,
  base: 1,
  bullish: 1.2,
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

function roundPx(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Build a stance-scaled fallback path from the generic theme shape.
 * Used only to fill gaps the model left empty — never to override a valid
 * model-produced number. Bullish > base > bearish scales the same shape.
 */
export function shapedFallbackPath(
  spot: number,
  theme: ForecastTheme,
  stance: ForecastStance
): Record<ForecastYear, number> {
  const mults = THEME_BASE_MULTS[theme];
  const scale = STANCE_PATH_SCALE[stance];
  const out = {} as Record<ForecastYear, number>;
  for (let i = 0; i < FORECAST_YEARS.length; i++) {
    const year = FORECAST_YEARS[i]!;
    const baseMult = mults[i] ?? mults[mults.length - 1]!;
    const scaledMult = 1 + (baseMult - 1) * scale;
    out[year] = roundPx(Math.max(0.01, spot * scaledMult));
  }
  return enforcePathRules(out, spot);
}

/**
 * Fill any year the model left empty/invalid with the generic fallback
 * shape. Unlike a "floor", this never overrides a valid model-produced
 * price — every ticker's real forecast is reasoned by the model itself.
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

Macro backdrop: Tom Lee–style (liquidity + AI spend + crypto institutionalization) is a reasonable structurally-supportive backdrop for risk assets in general — use it as color, not a script to copy on every ticker/year. Every ticker gets its OWN bottom-up thesis; there is no fixed price target to match.

### Required dynamics
- Non-linear paths: bull runs and/or consolidation years, reasoned from that specific company's fundamentals and cycle — never a flat CAGR line.
- Crypto-adjacent names: consider a violent mid-path winter, then recovery, if that fits the specific asset.
- Capex-heavy / infra names: digestion can mean a slower-up year, not necessarily a collapse.
- Trim/add lines may list multiple names or sector sleeves — not one ticker only.
- Be honest: some names deserve a modest, unglamorous path. Not every holding is a multi-bagger candidate.

### Forbidden
- Near-linear ramps (same $ or YoY step for 3+ years).
- Copy-pasting the same magnitude across unrelated tickers.
- Rationale phrases: overridden, rejected, too timid, sheet-aligned, calibrated path, house baseline.
- Presenting any of this as a guarantee or personalized recommendation — it's a modeled scenario for discussion, not investment advice.

### Rationale
One human sentence on micro-thesis + path dynamics (bull / winter / digestion), grounded in that company's actual business — not a generic sector script.`;
