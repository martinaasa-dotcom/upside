import { z } from "zod";
import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import type { ForecastModel, ForecastYear } from "@/lib/forecast";
import { FORECAST_YEARS } from "@/lib/forecast";
import {
  FORECAST_CONVICTION_PROMPT,
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
            "What to add or overweight — prefer tickers already in the book or clear adjacent themes"
          ),
        trim: z
          .string()
          .describe(
            "What to trim or underweight — be specific; say if nothing material"
          ),
        notes: z
          .string()
          .optional()
          .describe("Optional one-liner on catalysts, earnings, or sizing"),
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
};

export type StoredForecastPlans = Record<string, ForecastPlan>;

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
      return `STANCE = BEARISH. Slower terminals (~35% of bullish upside bands) and deeper drawdowns OK — but paths must STILL be non-linear with named dynamics. No timid straight lines.`;
    case "bullish":
      return `STANCE = BULLISH. Hit the conviction magnitude bands (AI infra ~4–8× by 2030, AI power ~2.5–5×, crypto ~3–7× with a winter). Reason every price from micro-thesis — size like a high-conviction bull, shape like a real market.`;
    default:
      return `STANCE = BASE. Still structurally bullish on AI infra / datacenter power / crypto (~70% of bullish terminals). Non-linear paths mandatory. Do not collapse into sell-side "base case" timidity.`;
  }
}

/**
 * Guarantee every holding has every FORECAST_YEAR filled.
 * Prefer model prices; backfill gaps with theme-shaped non-linear paths (never flat CAGR).
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
    const shaped = shapedFallbackPath(spot, theme, stance);
    const prices = {
      ...shaped,
      ...(existing?.prices ?? {}),
    } as Record<ForecastYear, number>;

    for (const year of FORECAST_YEARS) {
      const p = prices[year];
      if (!(typeof p === "number" && p > 0)) {
        prices[year] = shaped[year];
      }
    }

    // If the model returned an almost-flat linear ramp, reshape crypto/AI to conviction path
    if (isNearLinear(prices, spot) && theme !== "index") {
      Object.assign(prices, shaped);
    }

    out.push({
      ticker: row.ticker,
      prices: prices as ForecastPlan["eoyTargets"][number]["prices"],
      rationale:
        existing?.rationale ??
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
3. Add/Trim must be actionable for THIS book — prefer names already held; if suggesting a new ticker, say why and keep it light.
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
