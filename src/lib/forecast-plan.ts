import { z } from "zod";
import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import type { ForecastModel, ForecastYear } from "@/lib/forecast";
import { FORECAST_YEARS } from "@/lib/forecast";
import {
  FORECAST_CONVICTION_PROMPT,
  enforcePathRules,
  forecastThemeForTicker,
  shapedFallbackPath,
} from "@/lib/forecast-conviction";

export const FORECAST_PLAN_STORAGE_KEY = "portfell-forecast-plan-by-portfolio";

export type ForecastStance = "bearish" | "base" | "bullish";

/** Rough sector tags so Margus can talk rotation without inventing holdings. */
export const TICKER_SECTORS: Record<string, string> = {
  NBIS: "AI infra / GPU cloud",
  CRWV: "AI infra / neo-cloud",
  RKLB: "Space / aerospace",
  BMNR: "Crypto / BTC treasury",
  VST: "AI power / generation",
  SOFI: "Fintech / consumer finance",
  HOOD: "Fintech / brokerage",
  PLTR: "AI software / data platforms",
  NOW: "Enterprise / AI software",
  NVDA: "Semiconductors / AI chips",
  AVGO: "Semiconductors / AI interconnect",
  RDDT: "Consumer internet / social",
  PWR: "AI power / grid infrastructure",
  ASML: "Semiconductors / lithography",
  "ASML.AS": "Semiconductors / lithography",
  GOOGL: "Big tech / AI spend",
  SPY: "US large-cap index",
  "CSPX.L": "US large-cap index (UCITS)",
  "VWCE.DE": "Global equity ETF",
  "SMH.L": "Semiconductor ETF",
  "ABEA.DE": "Big tech / AI spend (EU listing)",
  "JEDI.L": "Thematic ETF",
  "ANX.PA": "European equity",
  "EX13.VI": "European equity ETF",
};

const yearPriceSchema = z.object({
  2026: z.number().positive(),
  2027: z.number().positive(),
  2028: z.number().positive(),
  2029: z.number().positive(),
  2030: z.number().positive(),
});

export const forecastPlanSchema = z.object({
  generalAdvice: z
    .string()
    .describe(
      "2–4 sentences of actionable book-level advice (risk, concentration, CC overlap, cash)."
    ),
  sectorRotation: z
    .string()
    .describe(
      "What sector / factor rotation looks plausible over the next quarter and year, tied to this book."
    ),
  periods: z
    .array(
      z.object({
        label: z
          .string()
          .describe(
            'Horizon label, e.g. "Next quarter (Q4 2026)", "2027", "2028–2029"'
          ),
        theme: z.string().describe("Short memorable theme name for the period"),
        add: z
          .string()
          .describe(
            'ONE short line, max ~14 words. Format: "TICKER / TICKER — why". Example: "BMNR / HOOD — crypto + fintech rally on liquidity". Prefer book tickers. Never empty; say "Hold — no add" if nothing.'
          ),
        trim: z
          .string()
          .describe(
            'ONE short line, max ~14 words. Format: "TICKER — why". Example: "NBIS — trim into AI digestion". Never empty; say "Hold — no trim" if nothing.'
          ),
        notes: z
          .string()
          .optional()
          .describe(
            "Optional ONE short context line only — do NOT repeat add/trim tickers here"
          ),
      })
    )
    .min(2)
    .max(6),
  eoyTargets: z
    .array(
      z.object({
        ticker: z
          .string()
          .describe("Exact ticker as listed in holdings (keep exchange suffix)"),
        prices: yearPriceSchema.describe(
          "NON-LINEAR EOY prices 2026–2030. Forbidden: equal steps / flat CAGR. Crypto needs a winter year; AI infra can rip with digestion as slower-up not collapse."
        ),
        rationale: z
          .string()
          .optional()
          .describe(
            "Name the path dynamics (bull run / winter / digestion) + micro-thesis in one tight sentence"
          ),
      })
    )
    .describe(
      "EOY SP for EVERY holding, all years 2026–2030. High-conviction AI infra / AI power / crypto magnitudes. Never paste spot across years. Never draw a straight line."
    ),
});

export type ForecastPlan = z.infer<typeof forecastPlanSchema> & {
  generatedAt: string;
  portfolioId: string;
  portfolioName: string;
  stance: ForecastStance;
  /** Sorted ticker fingerprint when the plan was generated */
  holdingsKey?: string;
};

export type StoredForecastPlans = Record<string, ForecastPlan>;

export const FORECAST_AUTO_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

export function forecastHoldingsKey(tickers: string[]): string {
  return [...new Set(tickers.map((t) => t.toUpperCase()))].sort().join("|");
}

export type ForecastAutoRefresh =
  | { run: false; reason: "ok" | "empty" }
  | {
      run: true;
      reason: "first-run" | "new-holdings" | "weekly";
    };

/** Auto API refresh only for first run, new tickers, or weekly staleness. */
export function shouldAutoRefreshForecast(input: {
  plan: ForecastPlan | null;
  tickers: string[];
  fullyCovered: boolean;
  nowMs?: number;
}): ForecastAutoRefresh {
  const tickers = input.tickers.map((t) => t.toUpperCase());
  if (tickers.length === 0) return { run: false, reason: "empty" };

  const plan = input.plan;

  if (!plan) {
    if (!input.fullyCovered) return { run: true, reason: "first-run" };
    return { run: false, reason: "ok" };
  }

  if (!plan.generatedAt && !input.fullyCovered) {
    return { run: true, reason: "first-run" };
  }

  const planKey =
    plan.holdingsKey ??
    forecastHoldingsKey((plan.eoyTargets ?? []).map((t) => t.ticker));
  const planSet = new Set(
    planKey
      ? planKey.split("|").filter(Boolean)
      : (plan.eoyTargets ?? []).map((t) => t.ticker.toUpperCase())
  );
  const hasNew = tickers.some((t) => !planSet.has(t));
  if (hasNew) return { run: true, reason: "new-holdings" };

  if (plan.generatedAt) {
    const age = (input.nowMs ?? Date.now()) - new Date(plan.generatedAt).getTime();
    if (Number.isFinite(age) && age >= FORECAST_AUTO_REFRESH_MS) {
      return { run: true, reason: "weekly" };
    }
  } else if (!input.fullyCovered) {
    return { run: true, reason: "first-run" };
  }

  return { run: false, reason: "ok" };
}

export function loadForecastPlan(portfolioId: string): ForecastPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FORECAST_PLAN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredForecastPlans;
    const plan = parsed?.[portfolioId];
    if (!plan?.periods?.length) return null;
    return {
      ...plan,
      stance: plan.stance ?? "base",
      eoyTargets: plan.eoyTargets ?? [],
    };
  } catch {
    return null;
  }
}

export function saveForecastPlan(plan: ForecastPlan) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(FORECAST_PLAN_STORAGE_KEY);
    const parsed = (raw ? JSON.parse(raw) : {}) as StoredForecastPlans;
    parsed[plan.portfolioId] = plan;
    localStorage.setItem(FORECAST_PLAN_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

function stanceGuidance(stance: ForecastStance): string {
  switch (stance) {
    case "bearish":
      return `STANCE = BEARISH. Soften the spreadsheet BASE (~55% of base upside), deeper winters OK — still non-linear. Do not invent a timid "everything dips in 2026" book.`;
    case "bullish":
      return `STANCE = BULLISH. Same shapes as Martin's BASE spreadsheet, but materially HIGHER (~+25–40% vs base on terminals; 2026 still above base 2026). NBIS/CRWV must clear spot hard in 2026.`;
    default:
      return `STANCE = BASE. Match Martin's spreadsheet magnitude (NBIS ~1.33× spot by EOY 2026 → ~5.6× by 2030; CRWV ~1.26× → ~6.4×; BMNR rip then 2028 winter). This is NOT a quiet sell-side base. Forbidden: EOY 2026 below spot on NBIS/CRWV/BMNR/VST.`;
  }
}

/** Model path is too timid vs calibrated BASE (e.g. NBIS 182 when sheet says ~255). */
function isTimidVsBase(
  prices: Record<ForecastYear, number>,
  shaped: Record<ForecastYear, number>,
  spot: number,
  theme: ReturnType<typeof forecastThemeForTicker>,
  stance: ForecastStance
): boolean {
  if (stance === "bearish") return false;
  const y2026 = FORECAST_YEARS[0]!;
  const y2030 = FORECAST_YEARS[FORECAST_YEARS.length - 1]!;
  const p26 = prices[y2026];
  const s26 = shaped[y2026];
  const p30 = prices[y2030];
  const s30 = shaped[y2030];

  // Classic bug: AI infra / crypto opening year below spot on base/bullish
  if (
    (theme === "ai_infra" ||
      theme === "ai_power" ||
      theme === "crypto" ||
      theme === "space") &&
    typeof p26 === "number" &&
    p26 < spot * 1.05
  ) {
    return true;
  }

  // 2026 far below spreadsheet-shaped floor
  if (
    typeof p26 === "number" &&
    typeof s26 === "number" &&
    p26 < s26 * 0.85
  ) {
    return true;
  }

  // Terminal massively under base calibration
  if (
    typeof p30 === "number" &&
    typeof s30 === "number" &&
    theme !== "index" &&
    p30 < s30 * 0.7
  ) {
    return true;
  }

  return false;
}

/**
 * Guarantee every holding has every FORECAST_YEAR filled.
 * Prefer model prices only when they clear conviction floors; otherwise use
 * spreadsheet-calibrated shaped paths (Martin's BASE sheet).
 */
export function ensureCompleteEoyTargets(
  forecast: ForecastModel,
  eoyTargets: ForecastPlan["eoyTargets"],
  stance: ForecastStance
): ForecastPlan["eoyTargets"] {
  const byTicker = new Map<string, ForecastPlan["eoyTargets"][number]>();
  for (const t of eoyTargets ?? []) {
    byTicker.set(t.ticker.toUpperCase(), {
      ...t,
      ticker: t.ticker,
      prices: { ...t.prices },
    });
  }

  const out: ForecastPlan["eoyTargets"] = [];
  for (const row of forecast.rows) {
    const key = row.ticker.toUpperCase();
    const existing = byTicker.get(key);
    const spot = row.currentPrice > 0 ? row.currentPrice : 1;
    const theme = forecastThemeForTicker(row.ticker);
    const shaped = shapedFallbackPath(spot, theme, stance, row.ticker);
    let prices = {
      ...shaped,
      ...(existing?.prices ?? {}),
    } as Record<ForecastYear, number>;

    for (const year of FORECAST_YEARS) {
      const p = prices[year];
      if (!(typeof p === "number" && p > 0)) {
        prices[year] = shaped[year];
      }
    }

    const reshape =
      (isNearLinear(prices, spot) && theme !== "index") ||
      isTimidVsBase(prices, shaped, spot, theme, stance);

    if (reshape) {
      prices = { ...shaped };
    } else {
      prices = enforcePathRules(prices, spot, theme, stance);
    }

    out.push({
      ticker: row.ticker,
      prices: prices as ForecastPlan["eoyTargets"][number]["prices"],
      rationale: reshape
        ? `Calibrated ${stance} ${theme} path (sheet-aligned; model path rejected as too timid)`
        : existing?.rationale ??
          `Thesis ${stance} ${theme} path from spot ${spot.toFixed(2)} (non-linear)`,
    });
  }
  return out;
}

/** Detect boring equal-step / near-constant YoY ramps the model sometimes emits. */
function isNearLinear(
  prices: Record<ForecastYear, number>,
  spot: number
): boolean {
  const seq = [spot, ...FORECAST_YEARS.map((y) => prices[y])];
  const yoy: number[] = [];
  for (let i = 1; i < seq.length; i++) {
    const prev = seq[i - 1]!;
    const cur = seq[i]!;
    if (!(prev > 0) || !(cur > 0)) return false;
    yoy.push(cur / prev - 1);
  }
  if (yoy.length < 3) return false;
  const mean = yoy.reduce((s, x) => s + x, 0) / yoy.length;
  const variance =
    yoy.reduce((s, x) => s + (x - mean) ** 2, 0) / yoy.length;
  // Nearly identical YoY each year → linear idiot path
  if (variance < 0.0008 && Math.abs(mean) < 0.35) return true;
  // Nearly equal dollar steps
  const steps: number[] = [];
  for (let i = 1; i < seq.length; i++) steps.push(seq[i]! - seq[i - 1]!);
  const stepMean = steps.reduce((s, x) => s + x, 0) / steps.length;
  const stepVar =
    steps.reduce((s, x) => s + (x - stepMean) ** 2, 0) / steps.length;
  const scale = Math.max(Math.abs(stepMean), spot * 0.02);
  return stepVar < (scale * 0.15) ** 2;
}

export function buildForecastPlanPrompt(input: {
  portfolioName: string;
  cashBalance: number;
  forecast: ForecastModel;
  stance: ForecastStance;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-11
  const quarter = Math.floor(month / 3) + 1;
  const nextQuarter =
    quarter === 4
      ? { q: 1, y: year + 1 }
      : { q: quarter + 1, y: year };

  const lines = input.forecast.rows.map((r) => {
    const sector =
      TICKER_SECTORS[r.ticker] ??
      TICKER_SECTORS[r.ticker.split(".")[0]!] ??
      "unclassified";
    const theme = forecastThemeForTicker(r.ticker);
    return `${r.ticker} [${sector} · theme=${theme}]: shares=${r.shares}, spot=${r.currentPrice.toFixed(2)}, value=${r.currentValue.toFixed(0)}, covered=${r.hasTargets ? "yes" : "NEED FULL PATH"}`;
  });

  const yearsList = FORECAST_YEARS.join(", ");

  return `${MARGUS_PERSONA}

${FORECAST_CONVICTION_PROMPT}

Build an actionable trim/add + theme plan AND a full EOY stock-price prognosis for Upside portfolio "${input.portfolioName}".

CRITICAL: Reason every price from each company's micro-thesis + the conviction bands above. Do NOT paste sell-side targets. Do NOT draw straight lines. Never leave a ticker or year empty. Never paste the same spot across all years unless cash-like (say so).

Today (UTC): ${now.toISOString().slice(0, 10)} · next quarter ≈ Q${nextQuarter.q} ${nextQuarter.y} · next calendar year ${year + 1}.

${stanceGuidance(input.stance)}

Cash: ${input.cashBalance}
Current portfolio value (equity+cash): ${input.forecast.currentTotal.toFixed(0)}

Holdings (share counts stay fixed unless you explicitly recommend trimming/adding size):
${lines.length ? lines.join("\n") : "(no holdings)"}

Requirements:
1. periods MUST include:
   - Next quarter (label like "Next quarter (Q${nextQuarter.q} ${nextQuarter.y})")
   - Next year (label "${year + 1}" or "Next year (${year + 1})")
   - Then 2–3 longer horizons aligned to the EOY path (e.g. 2028, 2029, 2030) if useful — not more than 6 total.
2. Themes should be memorable but practical (not marketing fluff).
3. Add and Trim are SEPARATE one-liners — scannable actions, not essays:
   - add: max ~14 words. "TICKERS — why" e.g. "BMNR / HOOD — fintech + crypto liquidity rally"
   - trim: max ~14 words. "TICKER — why" e.g. "NBIS — light trim into AI digestion"
   - If nothing to do: "Hold — no add" / "Hold — no trim" (never leave blank, never bury in notes)
   - Prefer tickers already in this book; new names only if essential and named
4. sectorRotation: talk through plausible rotations given concentration in this book.
5. generalAdvice: sizing, CC overlap risk, cash, and what NOT to do.
6. eoyTargets: REQUIRED for EVERY ticker listed above. Use the exact ticker strings (keep ".AS", ".L", ".DE", etc.).
   - Provide a positive price for EACH of years ${yearsList} — all five required, no omissions.
   - NON-LINEAR only. Crypto: include a winter year. AI infra / AI power: multi-bagger magnitude on bullish/base. Space: digestion year.
   - In each rationale, name the dynamics (bull run / winter / digestion) in one sentence.
7. Do not invent fake share counts or claim trades already happened.
8. Be concise.`;
}

export function planEoyPaths(
  plan: ForecastPlan
): { ticker: string; prices: Partial<Record<ForecastYear, number>> }[] {
  return (plan.eoyTargets ?? []).map((t) => ({
    ticker: t.ticker,
    prices: t.prices as Partial<Record<ForecastYear, number>>,
  }));
}
