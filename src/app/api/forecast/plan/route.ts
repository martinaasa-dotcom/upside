import {
  STRUCTURED_PROVIDER_OPTIONS,
  buildAdvisorProviderChain,
  withAdvisorFallback,
} from "@/lib/ai/model";
import { humanizeMargusTree } from "@/lib/ai/humanize-copy";
import {
  buildFallbackForecastPlan,
  buildForecastPlanPrompt,
  ensureCompleteEoyTargets,
  DEFAULT_FORECAST_STANCE,
} from "@/lib/forecast-plan";
import { forecastPlanSchema } from "@/lib/forecast-plan-schema";
import type { ForecastModel } from "@/lib/forecast";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateObject } from "ai";

export const maxDuration = 120;
export const runtime = "nodejs";

/**
 * Stop reasoning with enough of maxDuration left to still build and send a
 * JSON response. Overrunning means the platform kills the function and the
 * browser gets its plain-text error page, which used to surface to the user
 * as a raw "... is not valid JSON" parser error.
 */
const LLM_BUDGET_MS = 95_000;

export async function POST(req: Request) {
  const startedAt = Date.now();
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  let body: {
    portfolioId?: string;
    portfolioName?: string;
    cashBalance?: number;
    forecast?: ForecastModel;
    convictions?: Record<string, { level: number; thesis: string }>;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Couldn't read that request." }, { status: 400 });
  }

  const limit = checkRateLimit(`forecast:${auth.user.id}`, 12, 10 * 60_000);
  if (!limit.ok) {
    return Response.json(
      { error: "Forecast requests are limited. Try again in a bit." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec ?? 30) } }
    );
  }

  const portfolioId = String(body.portfolioId ?? "");
  const portfolioName = String(body.portfolioName ?? "Portfolio");
  const cashBalance = Number(body.cashBalance ?? 0);
  const forecast = body.forecast;
  const convictions = body.convictions;

  if (!portfolioId || !forecast?.rows) {
    return Response.json(
      { error: "portfolioId and forecast snapshot required" },
      { status: 400 }
    );
  }

  const fallbackPlan = () =>
    buildFallbackForecastPlan({
      forecast,
      portfolioId,
      portfolioName,
    });

  const providerChain = buildAdvisorProviderChain({ reasoning: true });
  if (providerChain.length === 0) {
    return Response.json({ plan: fallbackPlan(), fallback: true });
  }

  try {
    const prompt = buildForecastPlanPrompt({
      portfolioName,
      cashBalance,
      forecast,
      convictions,
    });

    const { object } = await withAdvisorFallback(
      providerChain,
      (model, _providerId, signal) =>
        generateObject({
          model,
          schema: forecastPlanSchema,
          prompt,
          maxRetries: 1,
          abortSignal: signal ?? req.signal,
          providerOptions: STRUCTURED_PROVIDER_OPTIONS,
        }),
      { deadlineAt: startedAt + LLM_BUDGET_MS, signal: req.signal }
    );

    const eoyTargets = ensureCompleteEoyTargets(
      forecast,
      object.eoyTargets ?? []
    );

    const plan = humanizeMargusTree({
      ...object,
      eoyTargets,
      generatedAt: new Date().toISOString(),
      portfolioId,
      portfolioName,
      stance: DEFAULT_FORECAST_STANCE,
    });

    return Response.json({ plan });
  } catch (err) {
    if (req.signal.aborted) {
      return Response.json({ error: "Stopped." }, { status: 499 });
    }
    console.error("[forecast/plan]", err);
    // A person is staring at a flat grid. Never leave them with an error
    // and today's price pasted across 2026-2030.
    return Response.json({ plan: fallbackPlan(), fallback: true });
  }
}
