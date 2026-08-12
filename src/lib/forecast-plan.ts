import { z } from "zod";
import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import type { ForecastModel, ForecastYear } from "@/lib/forecast";
import { FORECAST_YEARS } from "@/lib/forecast";
import {
  FORECAST_CONVICTION_PROMPT,
  fillMissingForecastYears,
  forecastThemeForTicker,
  shapedFallbackPath,
} from "@/lib/forecast-conviction";
import { todayKeyInTz } from "@/lib/timezone";

export const FORECAST_PLAN_STORAGE_KEY = "portfell-forecast-plan-by-portfolio";

export type ForecastStance = "bearish" | "base" | "bullish";

/** Default stance — reasonable base case. No user stance toggle yet. */
export const DEFAULT_FORECAST_STANCE: ForecastStance = "base";

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
  NOW: "Enterprise SaaS / AI software",
  CRM: "Enterprise SaaS",
  DDOG: "Cloud SaaS / observability",
  SNOW: "Data SaaS",
  NVDA: "Semiconductors / AI chips",
  AVGO: "Semiconductors / AI interconnect",
  RDDT: "Consumer internet / social",
  PWR: "AI power / grid infrastructure",
  ASML: "Semiconductors / lithography",
  "ASML.AS": "Semiconductors / lithography",
  GOOGL: "Big tech / AI spend",
  UNH: "Healthcare / managed care",
  LLY: "Healthcare / biopharma",
  ISRG: "Healthcare / medtech",
  AVAV: "Defense / drones",
  KTOS: "Defense / drones",
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
            'Actionable adds — multiple OK. Format: "NAME / NAME — why" or "SaaS / drones — why". Names can be book tickers, new tickers, or sectors (SaaS, healthcare, drones, AI power…). Max ~40 words. Never empty; say "Hold — no add" if nothing.'
          ),
        trim: z
          .string()
          .describe(
            'Actionable trims — multiple OK. Format: "TICKER / TICKER — why" or "fintech sleeve — why". Max ~40 words. Never empty; say "Hold — no trim" if nothing.'
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
            "Human thesis in one sentence: micro-thesis + path dynamics (bull run / winter / digestion). Never say overridden, rejected, calibrated, or sheet-aligned."
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

export const FORECAST_AUTO_REFRESH_MS = 30 * 24 * 60 * 60 * 1000; // monthly thesis check

export function forecastHoldingsKey(tickers: string[]): string {
  return [...new Set(tickers.map((t) => t.toUpperCase()))].sort().join("|");
}

export type ForecastAutoRefresh =
  | { run: false; reason: "ok" | "empty" }
  | {
      run: true;
      reason: "first-run" | "monthly";
    };

/** Auto API refresh for first run, then monthly (not daily). */
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
  // New holdings are filled via local calibration merge; skip full-model rerun.
  if (hasNew) return { run: false, reason: "ok" };

  if (plan.generatedAt) {
    const age =
      (input.nowMs ?? Date.now()) - new Date(plan.generatedAt).getTime();
    if (Number.isFinite(age) && age >= FORECAST_AUTO_REFRESH_MS) {
      return { run: true, reason: "monthly" };
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
      return `STANCE = BEARISH. Softer paths, deeper winters OK — still non-linear and reasoned per-ticker. Do not invent a uniform "everything dips" book — some names hold up better than others.`;
    case "bullish":
      return `STANCE = BULLISH. More optimistic paths than the base case, but still grounded in each ticker's own fundamentals — not an across-the-board multiplier.`;
    default:
      return `STANCE = BASE CASE. Reason each ticker's path from its own fundamentals, sector cycle, and volatility — no fixed target to match. Consistency: if macro / company / sector thesis is unchanged between runs, keep magnitudes in a similar neighborhood — only reprice when the thesis meaningfully changes.`;
  }
}

function isJunkRationale(text: string | undefined): boolean {
  if (!text?.trim()) return true;
  return /too timid|sheet-aligned|overridden|rejected as|house baseline|calibrated \w+ \w+ path|thesis \w+ \w+ path from spot/i.test(
    text
  );
}

function themeDynamicsLabel(
  theme: ReturnType<typeof forecastThemeForTicker>
): string {
  switch (theme) {
    case "ai_infra":
      return "AI infra S-curve with digestion years, not a straight line";
    case "ai_power":
      return "datacenter power bottleneck compounding through buildout";
    case "crypto":
      return "crypto liquidity cycle with an explicit winter mid-path";
    case "space":
      return "launch-cadence story with digestion between expansion legs";
    case "semi":
      return "AI semi cycle — digests, then re-accelerates on spend";
    case "fintech":
      return "fintech beta to liquidity and risk appetite";
    case "software":
      return "software / SaaS adoption with mid-path digestion";
    case "healthcare":
      return "healthcare compounder with non-linear clinical / payer cycles";
    case "drones":
      return "defense / autonomy cadence with program digestion years";
    case "index":
      return "broad beta grind — muted vs single-name conviction";
    default:
      return "thesis path with non-linear bull / digestion phases";
  }
}

function fallbackRationale(input: {
  ticker: string;
  theme: ReturnType<typeof forecastThemeForTicker>;
  spot: number;
  prices: Record<ForecastYear, number>;
  existing?: string;
  reshaped: boolean;
}): string {
  if (!input.reshaped && !isJunkRationale(input.existing)) {
    return input.existing!.trim();
  }
  const y26 = input.prices[FORECAST_YEARS[0]!];
  const y30 = input.prices[FORECAST_YEARS[FORECAST_YEARS.length - 1]!];
  return `${input.ticker} — ${themeDynamicsLabel(input.theme)}; illustrative path EOY’26 ~$${Math.round(y26)} → ’30 ~$${Math.round(y30)} (spot $${input.spot.toFixed(0)}). Modeled scenario, not a target.`;
}

/**
 * Guarantee every holding has every FORECAST_YEAR filled. The model's own
 * numbers are always respected when present and reasonable; the generic
 * theme-shaped path only fills gaps or replaces a boringly-linear ramp.
 */
export function ensureCompleteEoyTargets(
  forecast: ForecastModel,
  eoyTargets: ForecastPlan["eoyTargets"],
  stance: ForecastStance = DEFAULT_FORECAST_STANCE
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
    const shaped = shapedFallbackPath(spot, theme, stance);
    let prices = fillMissingForecastYears(existing?.prices, shaped);

    // Only reshape when the model's path is a boring straight line —
    // never because it's "too timid" vs some target.
    const reshape = isNearLinear(prices, spot) && theme !== "index";
    if (reshape) {
      prices = { ...shaped };
    }

    out.push({
      ticker: row.ticker,
      prices: prices as ForecastPlan["eoyTargets"][number]["prices"],
      rationale: fallbackRationale({
        ticker: row.ticker,
        theme,
        spot,
        prices,
        existing: existing?.rationale,
        reshaped: reshape,
      }),
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
  stance?: ForecastStance;
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
  const stance = input.stance ?? DEFAULT_FORECAST_STANCE;

  return `${MARGUS_PERSONA}

${FORECAST_CONVICTION_PROMPT}

Build an actionable trim/add + theme plan AND a full EOY stock-price prognosis for Upside portfolio "${input.portfolioName}".

CRITICAL: Reason every price from each company's micro-thesis + the conviction bands above. Do NOT paste sell-side targets. Do NOT draw straight lines. Never leave a ticker or year empty. Never paste the same spot across all years unless cash-like (say so).

Today (Europe/Tallinn): ${todayKeyInTz()} · next quarter ≈ Q${nextQuarter.q} ${nextQuarter.y} · next calendar year ${year + 1}.

${stanceGuidance(stance)}

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
3. Add and Trim are SEPARATE action lines — multiple names/sectors allowed:
   - add: up to ~40 words. "NAME / NAME — why" OR sector sleeves e.g. "SaaS / healthcare / drones — why". Book tickers preferred; NEW tickers and sectors (SaaS, healthcare, drones, AI power, fintech…) are welcome when the thesis needs them.
   - trim: up to ~40 words. Multiple tickers OK ("TICKER / TICKER — digestion") or a sleeve ("fintech sleeve — liquidity fade").
   - If nothing to do: "Hold — no add" / "Hold — no trim" (never leave blank)
4. sectorRotation: talk through plausible rotations — AI infra, AI power, crypto, space, semis, SaaS, healthcare, drones, fintech, etc. Do not stay stuck in one box.
5. generalAdvice: sizing, CC overlap risk, cash, and what NOT to do.
6. eoyTargets: REQUIRED for EVERY ticker listed above. Use the exact ticker strings (keep ".AS", ".L", ".DE", etc.).
   - Provide a positive price for EACH of years ${yearsList} — all five required, no omissions.
   - NON-LINEAR only. Crypto: include a winter year. AI infra / AI power: multi-bagger magnitude. Space: digestion year.
   - rationale: one human sentence on micro-thesis + dynamics. FORBIDDEN words/phrases: overridden, rejected, too timid, sheet-aligned, calibrated path.
7. Consistency: if macro / company / sector thesis is unchanged from a prior run, keep EOY magnitudes in a similar neighborhood — do not randomly reshuffle for no reason.
8. Do not invent fake share counts or claim trades already happened.
9. Be concise.
10. Frame everything as a modeled scenario for the user's own thinking, never as a personalized recommendation or a guarantee.`;
}

export function planEoyPaths(
  plan: ForecastPlan
): { ticker: string; prices: Partial<Record<ForecastYear, number>> }[] {
  return (plan.eoyTargets ?? []).map((t) => ({
    ticker: t.ticker,
    prices: t.prices as Partial<Record<ForecastYear, number>>,
  }));
}
