import { resolveAdvisorModel } from "@/lib/ai/model";
import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import { fetchPulseContexts } from "@/lib/market/ticker-context";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import {
  buildFallbackPulseCheck,
  formatMovePct,
  pulseReportSchema,
  type PulseCheck,
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
  force?: boolean;
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
      `- **${c.ticker}** · spot $${c.price.toFixed(2)} · ${c.moveLabel} ${move}${flag}${c.inBook ? ` · ${bookPct}% of book · lifetime ROI ${roiPct}%` : " · (lookup — not in book)"}`,
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
Martin uses this when a **big line drops hard**. He asks: *should I sell — or add the dip?*

Primary job: **down ≥5% moves** (including pre-market / after-hours). Also covers other big book lines for context.

${fg}

### Action rules (Martin buys intact dips — do NOT default everything to hold)
- **action** = \`add\` | \`hold\` | \`trim\` | \`watch\`
- **intact thesis + red day** on house compounders (**NBIS, CRWV, RKLB, VST, BMNR**, AI infra / space): lean **add**, not hold. A digestion print that didn't break the multi-year story is a **steal**, not a trim signal.
- If a line is in **rapid euphoria** (parabolic move / crowd chase), prefer **trim** with explicit take-profit sizing.
- **addLevel** — always give a concrete price plan when thesis is intact or action is add:
  - \`Add now ~$X\` when spot is already attractive (e.g. after a −5–10% flush).
  - Or \`Add now ~$X · stagger below ~$Y\` where Y is **realistic** (~5–12% under spot, not fantasy).
  - Example RKLB ~$80 after −7% AH: \`Add now ~$80 · stagger below ~$72\` — NOT "wait for $50".
- Use **hold** only when you would not deploy (max concentration, broken narrative, no cash story).
- Use **trim** only when thesis is broken or euphorically extended.
- On a screen with multiple intact dips, **most** names should be **add**, not all hold.

For **each** ticker:
1. **situation** — 2–3 short sentences, grounded in headlines.
2. **moveReason** — one sentence (cite headline when possible).
3. **thesisStatus** — intact / watch / broken.
4. **action** — add / hold / trim / watch per rules above.
5. **trimPct** — only when action=trim: choose 10, 15, 20, 25, 30 (% of position).
6. **addLevel** — price trigger string (required for add; required for intact+down; empty for trim).
7. **earningsNote** — if relevant; else empty string.
8. **verdict** — one sentence tying **action + addLevel/trimPct** to the thesis.

**summary**: one sentence — lead with dips that are add opportunities vs real thesis breaks.

Keep fields short. Use the headlines — don't invent news.

## Positions
${lines.join("\n\n")}`;
}

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
    const body = (await req.json()) as Body;
    const candidates = body.candidates ?? [];
    if (candidates.length === 0) {
      return Response.json(
        { error: "No pulse candidates supplied" },
        { status: 400 }
      );
    }

    const tickers = candidates.map((c) => c.ticker);
    const contexts = await fetchPulseContexts(tickers, { force: body.force });
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

    const modelChecks = (object.checks ?? []) as PulseCheck[];
    const byTicker = new Map<string, PulseCheck>();
    for (const check of modelChecks) {
      byTicker.set(check.ticker.toUpperCase(), check);
    }

    const checks: PulseCheck[] = candidates.map((candidate) => {
      const key = candidate.ticker.toUpperCase();
      const fromModel = byTicker.get(key);
      if (fromModel) {
        return {
          ...fromModel,
          ticker: key,
          trimPct:
            fromModel.action === "trim"
              ? (fromModel.trimPct ?? null)
              : null,
        };
      }
      return buildFallbackPulseCheck(candidate);
    });

    const report: PulseReport = {
      summary: object.summary,
      checks,
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
