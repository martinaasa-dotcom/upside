import { z } from "zod";
import type { ForecastModel } from "@/lib/forecast";

export const FORECAST_PLAN_STORAGE_KEY = "portfell-forecast-plan-by-portfolio";

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
};

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
});

export type ForecastPlan = z.infer<typeof forecastPlanSchema> & {
  generatedAt: string;
  portfolioId: string;
  portfolioName: string;
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
    return plan;
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

export function buildForecastPlanPrompt(input: {
  portfolioName: string;
  cashBalance: number;
  forecast: ForecastModel;
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
    const sector = TICKER_SECTORS[r.ticker] ?? "unclassified";
    const eoy = input.forecast.years
      .map((y) => `${y}=${r.eoyPrices[y].toFixed(2)}`)
      .join(", ");
    return `${r.ticker} [${sector}]: shares=${r.shares}, spot=${r.currentPrice.toFixed(2)}, value=${r.currentValue.toFixed(0)}, eoySP=[${eoy}], hasHouseTarget=${r.hasTargets}`;
  });

  const totals = input.forecast.years
    .map((y) => `${y}=${input.forecast.eoyTotals[y].toFixed(0)}`)
    .join(", ");

  return `You are Assistant Margus for Upside. Build an actionable trim/add + theme plan for portfolio "${input.portfolioName}".

Today (UTC): ${now.toISOString().slice(0, 10)} · next quarter ≈ Q${nextQuarter.q} ${nextQuarter.y} · next calendar year ${year + 1}.

Cash: ${input.cashBalance}
Current portfolio value (equity+cash): ${input.forecast.currentTotal.toFixed(0)}
Projected portfolio values at house EOY SPs: ${totals}

Holdings (assume share counts stay fixed unless you explicitly recommend trimming/adding size):
${lines.length ? lines.join("\n") : "(no holdings)"}

Requirements:
1. periods MUST include:
   - Next quarter (label like "Next quarter (Q${nextQuarter.q} ${nextQuarter.y})")
   - Next year (label "${year + 1}" or "Next year (${year + 1})")
   - Then 2–3 longer horizons aligned to the EOY path (e.g. 2028, 2029, 2030) if useful — not more than 6 total.
2. Themes should be memorable but practical (not marketing fluff).
3. Add/Trim must be actionable for THIS book — prefer names already held; if suggesting a new ticker, say why and keep it light.
4. sectorRotation: talk through plausible rotations (AI infra vs power vs crypto vs fintech/space) given concentration in this book.
5. generalAdvice: sizing, CC overlap risk, cash, and what NOT to do.
6. Do not invent fake share counts or claim trades already happened.
7. Be concise.`;
}
