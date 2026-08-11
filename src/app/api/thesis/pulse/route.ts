import { resolveAdvisorModel } from "@/lib/ai/model";
import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import { fetchPulseContexts } from "@/lib/market/ticker-context";
import {
  pulseReportSchema,
  type PulseCandidate,
  type PulseReport,
} from "@/lib/thesis-pulse";
import { generateObject } from "ai";

export const maxDuration = 90;
export const runtime = "nodejs";

type Body = {
  candidates?: PulseCandidate[];
  convictions?: Record<string, { thesis?: string; level?: number }>;
  fearGreed?: { score?: number; rating?: string } | null;
};

function buildPrompt(
  candidates: PulseCandidate[],
  contexts: Awaited<ReturnType<typeof fetchPulseContexts>>,
  convictions: Body["convictions"],
  fearGreed: Body["fearGreed"]
): string {
  const fg =
    fearGreed?.score != null
      ? `Market mood: CNN Fear & Greed ${Math.round(fearGreed.score)} (${fearGreed.rating ?? "—"}).`
      : "Market mood: unknown.";

  const lines = candidates.map((c) => {
    const ctx = contexts[c.ticker.toUpperCase()];
    const conv = convictions?.[c.ticker.toUpperCase()];
    const todayPct = ((c.todayPct ?? 0) * 100).toFixed(1);
    const bookPct = (c.bookPct * 100).toFixed(1);
    const roiPct = (c.roiPct * 100).toFixed(0);
    const parts = [
      `- **${c.ticker}** · today ${todayPct}% · ${bookPct}% of book · lifetime ROI ${roiPct}% · $${c.currentValue.toFixed(0)} value`,
      conv?.thesis ? `  Owner thesis: ${conv.thesis}` : "  Owner thesis: (none saved)",
      conv?.level ? `  Conviction: ${conv.level}/5` : "",
      ctx?.sector ? `  Sector: ${ctx.sector}` : "",
    ];
    if (ctx?.lastEarningsDate) {
      parts.push(
        `  Last earnings: ${ctx.lastEarningsDate}${ctx.daysSinceLastEarnings != null ? ` (${ctx.daysSinceLastEarnings}d ago)` : ""}${ctx.lastSurprisePct != null ? ` · surprise ${ctx.lastSurprisePct.toFixed(0)}%` : ""}`
      );
    }
    if (ctx?.nextEarningsDate && (ctx.daysUntilNextEarnings ?? 99) >= 0) {
      parts.push(
        `  Next earnings: ${ctx.nextEarningsDate} (in ${ctx.daysUntilNextEarnings}d)`
      );
    }
    return parts.filter(Boolean).join("\n");
  });

  return `${MARGUS_PERSONA}

## Task — Thesis Pulse (simple)
Martin wants a **plain-English thesis check** on big book positions that moved **±5% or more today**.

${fg}

For each ticker below:
1. **moveReason** — one short sentence on why it moved (news, sector beta, earnings reaction, macro). No jargon soup.
2. **thesisStatus** — \`intact\` if the long-term thesis still holds; \`watch\` if something needs monitoring; \`broken\` only if fundamentals/narrative clearly broke (not just a red day).
3. **earningsNote** — if last print was within ~45 days or next is within ~14 days, say whether it was clean or had a nasty surprise; else empty string.
4. **verdict** — one sentence: hold, add on dip, trim, or watchlist — thesis-first.

Also write **summary**: one sentence on how the book's big movers feel today.

Keep every field short. No tables. No permabull fluff — honest and simple.

## Positions
${lines.join("\n\n")}`;
}

export async function POST(req: Request) {
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
    const body = (await req.json()) as Body;
    const candidates = body.candidates ?? [];
    if (candidates.length === 0) {
      return Response.json(
        { error: "No pulse candidates supplied" },
        { status: 400 }
      );
    }

    const tickers = candidates.map((c) => c.ticker);
    const contexts = await fetchPulseContexts(tickers);
    const prompt = buildPrompt(
      candidates,
      contexts,
      body.convictions ?? {},
      body.fearGreed ?? null
    );

    const { object } = await generateObject({
      model: resolveAdvisorModel({ reasoning: true }),
      schema: pulseReportSchema,
      prompt,
      maxRetries: 1,
      abortSignal: req.signal,
      providerOptions: {
        openrouter: {
          reasoning: { effort: "medium", max_tokens: 4000 },
        },
      },
    });

    const report: PulseReport = {
      summary: object.summary,
      checks: object.checks,
      generatedAt: new Date().toISOString(),
    };

    return Response.json({ report });
  } catch (err) {
    console.error("Pulse report failed", err);
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to build thesis pulse",
      },
      { status: 500 }
    );
  }
}
