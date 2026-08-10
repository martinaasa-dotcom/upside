import { resolveAdvisorModel } from "@/lib/ai/model";
import {
  buildForecastPlanPrompt,
  forecastPlanSchema,
} from "@/lib/forecast-plan";
import type { ForecastModel } from "@/lib/forecast";
import { generateObject } from "ai";

export const maxDuration = 90;
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    resolveAdvisorModel();
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
    });

    const { object } = await generateObject({
      model: resolveAdvisorModel(),
      schema: forecastPlanSchema,
      prompt,
      maxRetries: 2,
      abortSignal: req.signal,
    });

    return Response.json({
      plan: {
        ...object,
        generatedAt: new Date().toISOString(),
        portfolioId,
        portfolioName,
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
            "Model is rate-limited. Wait a few seconds and try again, or switch MODEL in .env.local.",
        },
        { status: 429 }
      );
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
