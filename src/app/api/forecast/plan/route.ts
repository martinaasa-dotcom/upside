import {
  buildAdvisorProviderChain,
  describeAdvisorError,
  withAdvisorFallback,
} from "@/lib/ai/model";
import {
  buildForecastPlanPrompt,
  ensureCompleteEoyTargets,
  DEFAULT_FORECAST_STANCE,
  type ForecastStance,
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
    const requestedStance = body.stance;
    const stance: ForecastStance =
      requestedStance === "bullish" ||
      requestedStance === "bearish" ||
      requestedStance === "base"
        ? requestedStance
        : DEFAULT_FORECAST_STANCE;
    const convictions = body.convictions as
      | Record<string, { level: number; thesis: string }>
      | undefined;

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
          providerOptions: {
            openrouter: {
              reasoning: { effort: "high", max_tokens: 6000 },
            },
          },
        }),
      { deadlineAt: startedAt + LLM_BUDGET_MS, signal: req.signal }
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
