import { resolveAdvisorModel } from "@/lib/ai/model";
import {
  buildForecastPlanPrompt,
  ensureCompleteEoyTargets,
  forecastPlanSchema,
  HOUSE_STANCE,
} from "@/lib/forecast-plan";
import type { ForecastModel } from "@/lib/forecast";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { generateObject } from "ai";

export const maxDuration = 120;
export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  try {
    resolveAdvisorModel({ reasoning: true });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Missing LLM API key. Add OPENROUTER_API_KEY to .env.local.",
      },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const portfolioId = String(body.portfolioId ?? "");
    const portfolioName = String(body.portfolioName ?? "Portfolio");
    const cashBalance = Number(body.cashBalance ?? 0);
    const forecast = body.forecast as ForecastModel | undefined;
    const stance = HOUSE_STANCE;

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

    const { object } = await generateObject({
      model: resolveAdvisorModel({ reasoning: true }),
      schema: forecastPlanSchema,
      prompt,
      maxRetries: 2,
      abortSignal: req.signal,
      providerOptions: {
        openrouter: {
          reasoning: { effort: "high", max_tokens: 6000 },
        },
      },
    });

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
        stance: HOUSE_STANCE,
      },
    });
  } catch (err) {
    console.error("[forecast/plan]", err);
    const msg =
      err instanceof Error
        ? err.message
        : "Failed to generate forecast plan";
    if (/rate.?limit|429|temporar/i.test(msg)) {
      return Response.json(
        {
          error:
            "Model is busy / rate-limited. Wait a few seconds and try again.",
        },
        { status: 429 }
      );
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
