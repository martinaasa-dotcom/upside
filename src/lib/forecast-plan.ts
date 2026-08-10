import { z } from "zod";
import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import type { ForecastModel, ForecastYear } from "@/lib/forecast";
import { FORECAST_YEARS } from "@/lib/forecast";

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
          "EOY stock prices for 2026–2030 matching the requested stance"
        ),
        rationale: z
          .string()
          .optional()
          .describe("One short reason for this path vs spot"),
      })
    )
    .describe(
      "EOY SP prognosis for EVERY holding. Must include every ticker with ALL years 2026–2030 filled — never omit a year, never copy spot flat for all years unless genuinely range-bound with rationale."
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
      return `STANCE = BEARISH. Bias EOY paths conservatively: slower growth, deeper drawdown years allowed, avoid heroic multiples. Still give a FULL reasoned 2026–2030 path per ticker — never leave a year blank and never paste spot into every year.`;
    case "bullish":
      return `STANCE = BULLISH. Bias EOY paths optimistically but grounded: stronger upside into 2029–2030, allow higher multiples for AI/semi/space/crypto names already held. Do not invent lottery tickets. Every year must be a real reasoned level.`;
    default:
      return `STANCE = BASE. Balanced prognosis from your own micro-thesis — realistic compounding with cyclicality. There are NO house price targets to copy. Reason from spot, sector, and structural tailwinds. Fill every year 2026–2030.`;
  }
}

/**
 * Guarantee every holding has every FORECAST_YEAR filled.
 * Prefer model prices; backfill gaps with stance-aware CAGR from spot (last resort).
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

  const cagr =
    stance === "bearish" ? 0.04 : stance === "bullish" ? 0.18 : 0.1;

  const out: ForecastPlan["eoyTargets"] = [];
  for (const row of forecast.rows) {
    const key = row.ticker.toUpperCase();
    const existing = byTicker.get(key);
    const prices = {
      ...(existing?.prices ?? {}),
    } as Record<ForecastYear, number>;
    const spot = row.currentPrice > 0 ? row.currentPrice : 1;

    for (let i = 0; i < FORECAST_YEARS.length; i++) {
      const year = FORECAST_YEARS[i];
      const p = prices[year];
      if (!(typeof p === "number" && p > 0)) {
        // Prefer interpolate from nearest known model years
        const filled = FORECAST_YEARS.map((y) => prices[y]).filter(
          (n): n is number => typeof n === "number" && n > 0
        );
        if (filled.length >= 1) {
          const lastKnown = filled[filled.length - 1]!;
          prices[year] = Math.round(lastKnown * (1 + cagr * 0.35) * 100) / 100;
        } else {
          const yearsOut = i + 1;
          prices[year] =
            Math.round(spot * Math.pow(1 + cagr, yearsOut) * 100) / 100;
        }
      }
    }

    out.push({
      ticker: row.ticker,
      prices: prices as ForecastPlan["eoyTargets"][number]["prices"],
      rationale:
        existing?.rationale ??
        `Reasoned ${stance} path from spot ${spot.toFixed(2)}`,
    });
  }
  return out;
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
      TICKER_SECTORS[r.ticker.split(".")[0]] ??
      "unclassified";
    return `${r.ticker} [${sector}]: shares=${r.shares}, spot=${r.currentPrice.toFixed(2)}, value=${r.currentValue.toFixed(0)}, covered=${r.hasTargets ? "yes" : "NEED FULL PATH"}`;
  });

  const yearsList = FORECAST_YEARS.join(", ");

  return `${MARGUS_PERSONA}

Build an actionable trim/add + theme plan AND a full EOY stock-price prognosis for Upside portfolio "${input.portfolioName}".

CRITICAL: There are NO house / spreadsheet EOY baselines. You MUST reason every price yourself from spot, micro-thesis, sector, and stance. Never leave a ticker or year empty. Never paste the same spot price across all years unless the name is a cash-like instrument (and say so in rationale).

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
   - Respect the STANCE bias with bottom-up reasoning (not consensus targets).
   - ETFs: modest CAGR with mild cyclicality. Single stocks: allow digestion years. Crypto/treasury names: cycle-aware.
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
