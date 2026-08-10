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
  VST: "Power / utilities",
  SOFI: "Fintech / consumer finance",
  HOOD: "Fintech / brokerage",
  PLTR: "Software / data platforms",
  NOW: "Enterprise software",
  NVDA: "Semiconductors / AI chips",
  AVGO: "Semiconductors",
  RDDT: "Consumer internet / social",
  PWR: "Power / infrastructure services",
  ASML: "Semiconductors / lithography",
  "ASML.AS": "Semiconductors / lithography",
  GOOGL: "Big tech / advertising",
  SPY: "US large-cap index",
  "CSPX.L": "US large-cap index (UCITS)",
  "VWCE.DE": "Global equity ETF",
  "SMH.L": "Semiconductor ETF",
  "ABEA.DE": "Big tech / advertising (EU listing)",
  "JEDI.L": "Thematic ETF",
  "ANX.PA": "European equity",
  "EX13.VI": "European equity ETF",
};

const yearPriceSchema = z.object({
  2026: z.number().positive().optional(),
  2027: z.number().positive().optional(),
  2028: z.number().positive().optional(),
  2029: z.number().positive().optional(),
  2030: z.number().positive().optional(),
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
      "EOY SP prognosis for EVERY holding on the sheet. Must cover all tickers. Stance-aware: bearish = conservative / lower path, base = house-like, bullish = optimistic but not fantasy."
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
      return `STANCE = BEARISH. Bias EOY paths conservatively: slower growth, deeper drawdown years allowed, avoid heroic multiples. Still give a full 2026–2030 path per ticker (not flat spot copies unless genuinely range-bound).`;
    case "bullish":
      return `STANCE = BULLISH. Bias EOY paths optimistically but grounded: stronger upside into 2029–2030, allow higher multiples for AI/semi/space names already held. Do not invent lottery tickets.`;
    default:
      return `STANCE = BASE. Balanced house-like prognosis: realistic compounding with some cyclicality. Prefer continuity with existing house targets when present; fill gaps for tickers that are currently flat.`;
  }
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
    const eoy = input.forecast.years
      .map((y) => `${y}=${r.eoyPrices[y].toFixed(2)}`)
      .join(", ");
    return `${r.ticker} [${sector}]: shares=${r.shares}, spot=${r.currentPrice.toFixed(2)}, value=${r.currentValue.toFixed(0)}, currentEoySP=[${eoy}], hasTarget=${r.hasTargets}`;
  });

  const totals = input.forecast.years
    .map((y) => `${y}=${input.forecast.eoyTotals[y].toFixed(0)}`)
    .join(", ");

  const yearsList = FORECAST_YEARS.join(", ");

  return `${MARGUS_PERSONA}

Build an actionable trim/add + theme plan AND a full EOY stock-price prognosis table for Upside portfolio "${input.portfolioName}". Apply your stance through this lens: high-conviction micro-theses, structural tailwinds, and realistic path (pullbacks OK; broken thesis ≠ noise).

Today (UTC): ${now.toISOString().slice(0, 10)} · next quarter ≈ Q${nextQuarter.q} ${nextQuarter.y} · next calendar year ${year + 1}.

${stanceGuidance(input.stance)}

Cash: ${input.cashBalance}
Current portfolio value (equity+cash): ${input.forecast.currentTotal.toFixed(0)}
Projected portfolio values at CURRENT table EOY SPs: ${totals}

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
   - Provide prices for years ${yearsList}.
   - Respect the STANCE bias.
   - Tickers currently marked hasTarget=false are flat at spot — you MUST invent a reasoned path for them (ETFs can be modest CAGR; single stocks can have cyclical years).
   - Tickers with existing targets may be adjusted up/down to match stance — do not ignore them.
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
