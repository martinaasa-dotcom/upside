import {
  buildAdvisorProviderChain,
  describeAdvisorError,
  withAdvisorFallback,
} from "@/lib/ai/model";
import { humanizeMargusTree, humanizeMargusText } from "@/lib/ai/humanize-copy";
import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import { fetchPulseContexts } from "@/lib/market/ticker-context";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  buildFallbackPulseCheck,
  formatMovePct,
  type PulseCheck,
  type PulseCandidate,
  type PulseHeadline,
  type PulseReport,
} from "@/lib/thesis-pulse";
import { pulseReportSchema } from "@/lib/thesis-pulse-schema";
import { generateObject } from "ai";

export const maxDuration = 90;
export const runtime = "nodejs";

/**
 * Absolute deadline measured from handler start, so the news/earnings
 * context fetch above counts against it too. Leaves headroom under
 * maxDuration to still return JSON rather than being killed mid-flight.
 */
const LLM_BUDGET_MS = 70_000;

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
    const flag = c.needsAttention ? " **NEEDS ATTENTION: down ≥5%**" : "";
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

## Task: Thesis Pulse
Martin uses this when a **big line drops hard**. He asks: *should I sell, or add the dip?*

Primary job: **down ≥5% moves** (including pre-market / after-hours). Also covers other big book lines for context.

${fg}

### Action rules (do NOT default everything to hold)
- **action** = \`add\` | \`hold\` | \`trim\` | \`watch\`
- **intact thesis + red day** on a high-conviction compounder (AI infra, AI power, space, or any name whose multi-year story is unbroken): lean **add**, not hold. A digestion print that didn't break the multi-year story is a **steal**, not a trim signal. This is about the thesis, not a fixed ticker list; apply it to whatever the user actually holds.
- If a line is in **rapid euphoria** (parabolic move / crowd chase), prefer **trim** with explicit take-profit sizing.
- **addLevel**: always give a concrete, self-explanatory price plan when thesis is intact or action is add:
  - \`Add now ~$X\` when spot is already attractive (e.g. after a −5–10% flush).
  - Or \`Add now ~$X · then more if it drops to ~$Y\` where Y is **realistic** (~5–12% under spot, not fantasy). Spell out that Y is a second, lower buy trigger, never bare jargon like "stagger below".
  - Example RKLB ~$80 after −7% AH: \`Add now ~$80 · then more if it drops to ~$72\`, NOT "wait for $50".
- Use **hold** only when you would not deploy (max concentration, broken narrative, no cash story).
- Use **trim** only when thesis is broken or euphorically extended.
- On a screen with multiple intact dips, **most** names should be **add**, not all hold.

For **each** ticker:
1. **situation**: 2-4 bullets, one short line each (under ~18 words), grounded in the headlines. No preamble bullet, no summary bullet, no paragraphs.
2. **moveReason**: one sentence (cite headline when possible).
3. **thesisStatus**: intact / watch / broken.
4. **action**: add / hold / trim / watch per rules above.
5. **trimPct**: only when action=trim, choose 10, 15, 20, 25, 30 (% of position).
6. **addLevel**: price trigger string (required for add; required for intact+down; empty for trim).
7. **earningsNote**: if relevant; else empty string.
8. **verdict**: one sentence tying **action + addLevel/trimPct** to the thesis.

**summary**: one sentence, lead with dips that are add opportunities vs real thesis breaks.

Keep fields short. Use the headlines, don't invent news.

## Positions
${lines.join("\n\n")}`;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const limit = checkRateLimit(`pulse:${auth.user.id}`, 12, 10 * 60_000);
  if (!limit.ok) {
    return Response.json(
      { error: "Thesis Pulse is limited. Try again in a bit." },
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

  const body = (await req.json().catch(() => ({}))) as Body;
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

  try {
    const prompt = buildPrompt(
      candidates,
      contexts,
      body.convictions ?? {},
      body.fearGreed ?? null
    );

    const { object } = await withAdvisorFallback(
      providerChain,
      (model, _providerId, signal) =>
        generateObject({
          model,
          schema: pulseReportSchema,
          prompt,
          maxRetries: 1,
          abortSignal: signal ?? req.signal,
          providerOptions: {
            openrouter: {
              reasoning: { effort: "medium", max_tokens: 6000 },
            },
          },
        }),
      { deadlineAt: startedAt + LLM_BUDGET_MS, signal: req.signal }
    );

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

    const report: PulseReport = humanizeMargusTree({
      summary: object.summary,
      checks,
      generatedAt: new Date().toISOString(),
    });

    return Response.json({ report, headlines });
  } catch (err) {
    console.error("Pulse report failed", err);
    const { message, status } = describeAdvisorError(err);

    // Free-tier daily quota / transient rate-limit: degrade to the
    // deterministic per-ticker read instead of blanking the whole page.
    // Pulse still shows something useful, clearly labeled as rule-based.
    if (status === 429) {
      const checks = candidates.map((c) => buildFallbackPulseCheck(c));
      const report: PulseReport = {
        summary: humanizeMargusText(
          `${message} Showing rule-based reads below meanwhile.`
        ),
        checks,
        generatedAt: new Date().toISOString(),
      };
      return Response.json({ report, headlines, degraded: true });
    }

    return Response.json({ error: message }, { status });
  }
}
