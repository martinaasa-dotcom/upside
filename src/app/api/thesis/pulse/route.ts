import { resolveAdvisorModel } from "@/lib/ai/model";
import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import { fetchPulseContexts } from "@/lib/market/ticker-context";
import {
  formatMovePct,
  pulseReportSchema,
  type PulseCandidate,
  type PulseHeadline,
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

function newsBlock(headlines: PulseHeadline[]): string {
  if (headlines.length === 0) return "  (no recent headlines fetched)";
  return headlines
    .map(
      (h) =>
        `  · ${h.title} (${h.publisher}, ${h.publishedAt.slice(0, 10)})`
    )
    .join("\n");
}

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
    const move = formatMovePct(c.effectivePct);
    const bookPct = (c.bookPct * 100).toFixed(1);
    const roiPct = (c.roiPct * 100).toFixed(0);
    const flag = c.needsAttention ? " **NEEDS ATTENTION — down ≥5%**" : "";
    const parts = [
      `- **${c.ticker}** · ${c.moveLabel} ${move}${flag}${c.inBook ? ` · ${bookPct}% of book · lifetime ROI ${roiPct}%` : " · (lookup — not in book)"}`,
      conv?.thesis ? `  Owner thesis: ${conv.thesis}` : "",
      conv?.level ? `  Conviction: ${conv.level}/5` : "",
      ctx?.sector ? `  Sector: ${ctx.sector}` : "",
      "  Recent headlines:",
      newsBlock(ctx?.news ?? []),
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

## Task — Thesis Pulse
Martin uses this when a **big line drops hard** and he asks: *should I sell?*

Primary job: **down ≥5% moves** (including pre-market / after-hours). Also covers other big book lines for context.

${fg}

For **each** ticker:
1. **situation** — 2–3 short sentences explaining what's going on **right now**, grounded in the supplied headlines. No filler.
2. **moveReason** — one sentence on what drove the move (cite headline when possible).
3. **thesisStatus** — \`intact\` if the long-term thesis still holds; \`watch\` if something needs monitoring; \`broken\` only if fundamentals/narrative clearly broke (not just a red day or earnings vol).
4. **earningsNote** — if last print was within ~45 days or next is within ~14 days, say clean vs nasty surprise; else empty string.
5. **verdict** — one sentence for a holder debating a sale: **hold**, add on dip, trim, or watch. Be direct on down days — don't reflexively say hold.

**summary**: one sentence — lead with sharp drops and whether they're noise or real thesis risk.

Keep fields short. Use the headlines — don't invent news.

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
    const headlines: Record<string, PulseHeadline[]> = {};
    for (const t of tickers) {
      headlines[t.toUpperCase()] = contexts[t.toUpperCase()]?.news ?? [];
    }

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
          reasoning: { effort: "medium", max_tokens: 6000 },
        },
      },
    });

    const report: PulseReport = {
      summary: object.summary,
      checks: object.checks,
      generatedAt: new Date().toISOString(),
    };

    return Response.json({ report, headlines });
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
