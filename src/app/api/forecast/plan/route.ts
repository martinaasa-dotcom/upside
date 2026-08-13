import {
  buildAdvisorProviderChain,
  describeAdvisorError,
  withAdvisorFallback,
} from "@/lib/ai/model";
import {
  buildForecastPlanPrompt,
  ensureCompleteEoyTargets,
  forecastPlanSchema,
  DEFAULT_FORECAST_STANCE,
} from "@/lib/forecast-plan";
import type { ForecastModel } from "@/lib/forecast";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateObject } from "ai";

export const maxDuration = 120;
export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const limit = checkRateLimit(`forecast:${auth.user.id}`, 12, 10 * 60_000);
  if (!limit.ok) {
    return Response.json(
      { error: "Forecast requests are limited. Try again in a bit." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec ?? 30) } }
    );
  }

  const providerChain = buildAdvisorProviderChain({ reasoning: true });
  if (providerChain.length === 0) {
    const { message } = describeAdvisorError(
      new Error("No LLM key configured")
    );
    return Response.json({ error: message }, { status: 503 });
  }

  try {
    const body = await req.json();
    const portfolioId = String(body.portfolioId ?? "");
    const portfolioName = String(body.portfolioName ?? "Portfolio");
    const cashBalance = Number(body.cashBalance ?? 0);
    const forecast = body.forecast as ForecastModel | undefined;
    const stance = DEFAULT_FORECAST_STANCE;

    if (!portfolioId || !forecast?.rows) {
      return Response.json(
        { error: "portfolioId and forecast snapshot required" },
        { status: 400 }
      );
    }

    const prompt = buildForecastPlanPrompt({
      portfolioName,
      cashBalance,
      forecast,
      stance,
    });

    const { object } = await withAdvisorFallback(providerChain, (model) =>
      generateObject({
        model,
        schema: forecastPlanSchema,
        prompt,
        maxRetries: 2,
        abortSignal: req.signal,
        providerOptions: {
          openrouter: {
            reasoning: { effort: "high", max_tokens: 6000 },
          },
        },
      })
    );

    const eoyTargets = ensureCompleteEoyTargets(
      forecast,
      object.eoyTargets ?? [],
      stance
    );

    return Response.json({
      plan: {
        ...object,
        eoyTargets,
        generatedAt: new Date().toISOString(),
        portfolioId,
        portfolioName,
        stance: DEFAULT_FORECAST_STANCE,
      },
    });
  } catch (err) {
    console.error("[forecast/plan]", err);
    const { message, status } = describeAdvisorError(err);
    return Response.json({ error: message }, { status });
  }
}
