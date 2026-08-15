import {
  beginBackgroundLlm,
  chatIsBusy,
  endBackgroundLlm,
} from "@/lib/ai/llm-slots";
import {
  buildAdvisorProviderChain,
  withAdvisorFallback,
} from "@/lib/ai/model";
import { humanizeMargusTree, humanizeMargusText } from "@/lib/ai/humanize-copy";
import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import { insightsPromptBlock } from "@/lib/book-insights";
import { fetchPulseContexts } from "@/lib/market/ticker-context";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  formatMovePct,
  reconcilePulseCheck,
  type PulseCheck,
  type PulseCandidate,
  type PulseHeadline,
  type PulseReport,
} from "@/lib/thesis-pulse";
import {
  getCachedPulseCheck,
  getPulseCacheKey,
  setCachedPulseCheck,
  getCachedPulseSummary,
  setCachedPulseSummary,
} from "@/lib/thesis-pulse-server-cache";
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

type CachedPulse = { check: PulseCheck; headlines: PulseHeadline[] };

function reuseCachedPulse(
  candidates: PulseCandidate[],
  cachedMap: Map<string, CachedPulse>,
  headlines: Record<string, PulseHeadline[]>
) {
  const checks = candidates.flatMap((c) => {
    const cached = cachedMap.get(c.ticker.toUpperCase());
    return cached ? [reconcilePulseCheck(cached.check)] : [];
  });
  const report: PulseReport = {
    summary: humanizeMargusText(getCachedPulseSummary() ?? ""),
    checks,
    generatedAt: new Date().toISOString(),
  };
  return Response.json({ report, headlines, reused: true });
}

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
      `- **${c.ticker}** · spot $${c.price.toFixed(2)} · ${c.moveLabel} ${move}${flag}${c.inBook ? ` · ${bookPct}% of book · lifetime ROI ${roiPct}%` : " · (lookup, not in book)"}`,
      conv?.thesis ? `  Why they own it: ${conv.thesis}` : "",
      conv?.level ? `  How sure they are: ${conv.level}/5` : "",
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

## Task: Pulse
Martin uses this when a **big line drops hard**. He asks: *should I sell, or add the dip?*

Primary job: **down ≥5% moves** (including pre-market / after-hours). Also covers other big book lines for context.

${fg}

${insightsPromptBlock(
    candidates
      .filter((c) => c.inBook)
      .map((c) => ({
        ticker: c.ticker,
        value: c.currentValue,
        todayPct: c.effectivePct,
      }))
  )}

### Action rules (do NOT default everything to hold)
- **action** = \`add\` | \`hold\` | \`trim\` | \`sell\` | \`watch\`
- **trim** and **sell** are opposites in spirit, don't blur them:
  - **trim** = disciplined profit-taking on a winner that ran too hot (parabolic move, crowd chase). The reason they own it is **intact or at most watch**. This is "take some money off the table because it went up a lot", never a reaction to bad news.
  - **sell** = the reason they own it is actually **broken**. You're exiting because that reason is gone, not because it went up too much.
- **intact reason + red day** on a name they are very sure about (AI computers, electricity for AI, space, or any name whose multi-year story is unbroken): lean **add**, not hold. A quiet down day that didn't break the multi-year story is a **steal**, not a trim signal. This is about why they own it, not a fixed ticker list; apply it to whatever the user actually holds.
- If a line is in **rapid euphoria** (parabolic move / crowd chase) with the reason still intact: prefer **trim** with explicit take-profit sizing.
- **addLevel**: always give a concrete, self-explanatory price plan when the reason is intact or action is add:
  - \`Add now ~$X\` when spot is already attractive (e.g. after a −5–10% flush).
  - Or \`Add now ~$X · then more if it drops to ~$Y\` where Y is **realistic** (~5–12% under spot, not fantasy). Spell out that Y is a second, lower buy trigger, never bare jargon like "stagger below".
  - Example RKLB ~$80 after −7% AH: \`Add now ~$80 · then more if it drops to ~$72\`, NOT "wait for $50".
- Use **hold** only when you would not deploy (max concentration, no cash story) but aren't ready to sell either. Hold never pairs with a broken reason.
- Use **sell** only when thesisStatus is broken. Never use **trim** for a broken reason. Never use **hold** for a broken reason either: that's what puts a Hold badge next to "Reason looks shaky".
- On a screen with multiple intact dips, **most** names should be **add**, not all hold.

### thesisStatus — start from intact. Watch and broken have to be earned
- First write **thesisBreak**: the concrete thing that would invalidate the reason this is in the book. Falsifiable. Not "the price drops."
- Then look at today's headlines and the move. **intact** unless those facts actually match the break list (watch) or show the break already happened (broken).
- **intact**: the reason you own it hasn't changed. A normal red or green day, sector-wide noise, profit-taking after a run, or after-hours drift are NOT breaks. If your situation bullets say nothing unusual happened, thesisStatus MUST be intact.
- **watch**: something on the break list is starting to show up (a soft quarter, a competitive wrinkle, a guidance nuance) but the core story still holds.
- **broken**: the actual reason you bought this is gone. Guidance genuinely cut, the staying power is disproven, fraud or a restatement, the multi-year story is over. This is rare. **broken must pair with action=sell, nothing else.** If you'd still hold it, the reason isn't broken, it's at most "watch".
- Do not mark watch or broken just because you mentioned a risk. The risk has to be happening now.

For **each** ticker:
1. **situation**: 2-4 bullets, one short line each (under ~18 words), grounded in the headlines. No preamble bullet, no summary bullet, no paragraphs.
2. **moveReason**: one sentence (cite headline when possible).
3. **thesisBreak**: one or two short sentences, concrete, what would actually break the reason they own it.
4. **thesisStatus**: intact / watch / broken, scored against thesisBreak and today's facts. Default intact.
5. **action**: add / hold / trim / sell / watch per rules above.
6. **trimPct**: only when action=trim, choose 10, 15, 20, 25, 30 (% of position). Never set for sell.
7. **addLevel**: price trigger string (required for add; required for intact+down; empty for trim/sell).
8. **earningsNote**: if relevant; else empty string.
9. **verdict**: one sentence tying **action + addLevel/trimPct** to why they own it.

**summary**: one sentence, lead with dips that are add opportunities vs real breaks in why they own it.

If the owner didn't write why they own it, still pick action and thesisStatus from headlines and today's prices. Never ask them to write a note. Never say you are guessing. Never say "tape".

Keep fields short. Use the headlines, don't invent news.

## Positions
${lines.join("\n\n")}`;
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as Body;
  const candidates = body.candidates ?? [];
  if (candidates.length === 0) {
    return Response.json(
      { error: "No pulse candidates supplied" },
      { status: 400 }
    );
  }

  const force = Boolean(body.force);
  const convictions = body.convictions ?? {};

  const cachedMap = new Map<string, CachedPulse>();
  const uncachedCandidates: PulseCandidate[] = [];

  for (const c of candidates) {
    const symbol = c.ticker.toUpperCase();
    const conv = convictions[symbol];
    const cacheKey = getPulseCacheKey(symbol, c.effectivePct, conv?.thesis, conv?.level);
    const cachedEntry = getCachedPulseCheck(cacheKey);
    if (cachedEntry) {
      cachedMap.set(symbol, {
        check: cachedEntry.check,
        headlines: cachedEntry.headlines,
      });
    }
    if (!cachedEntry || force) {
      uncachedCandidates.push(c);
    }
  }

  const headlines: Record<string, PulseHeadline[]> = {};
  for (const [symbol, cached] of cachedMap.entries()) {
    headlines[symbol] = cached.headlines;
  }

  if (uncachedCandidates.length === 0) {
    return reuseCachedPulse(candidates, cachedMap, headlines);
  }

  const limit = checkRateLimit(`pulse:${auth.user.id}`, 12, 10 * 60_000);
  if (!limit.ok) {
    return reuseCachedPulse(candidates, cachedMap, headlines);
  }

  const providerChain = buildAdvisorProviderChain({ reasoning: true });
  if (providerChain.length === 0) {
    return reuseCachedPulse(candidates, cachedMap, headlines);
  }

  if (chatIsBusy() || !beginBackgroundLlm()) {
    return reuseCachedPulse(candidates, cachedMap, headlines);
  }
  const heldSlot = true;

  const uncachedTickers = uncachedCandidates.map((c) => c.ticker);
  const contexts = await fetchPulseContexts(uncachedTickers, { force });
  for (const t of uncachedTickers) {
    headlines[t.toUpperCase()] = contexts[t.toUpperCase()]?.news ?? [];
  }

  try {
    const prompt = buildPrompt(
      uncachedCandidates,
      contexts,
      convictions,
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
    const newlyGeneratedMap = new Map<string, PulseCheck>();
    for (const check of modelChecks) {
      newlyGeneratedMap.set(check.ticker.toUpperCase(), check);
    }

    for (const candidate of uncachedCandidates) {
      const symbol = candidate.ticker.toUpperCase();
      const fromModel = newlyGeneratedMap.get(symbol);
      if (!fromModel) continue;
      const check = reconcilePulseCheck({
        ...fromModel,
        ticker: symbol,
        trimPct:
          fromModel.action === "trim" ? (fromModel.trimPct ?? null) : null,
      });

      const conv = convictions[symbol];
      const cacheKey = getPulseCacheKey(
        symbol,
        candidate.effectivePct,
        conv?.thesis,
        conv?.level
      );
      setCachedPulseCheck(
        cacheKey,
        check,
        headlines[symbol] ?? [],
        candidate.effectivePct
      );
      cachedMap.set(symbol, { check, headlines: headlines[symbol] ?? [] });
    }

    if (object.summary?.trim()) {
      setCachedPulseSummary(object.summary);
    }

    const checks: PulseCheck[] = candidates.flatMap((candidate) => {
      const entry = cachedMap.get(candidate.ticker.toUpperCase());
      return entry ? [reconcilePulseCheck(entry.check)] : [];
    });

    const report: PulseReport = humanizeMargusTree({
      summary: object.summary || getCachedPulseSummary() || "",
      checks,
      generatedAt: new Date().toISOString(),
    });

    return Response.json(
      {
        report,
        headlines,
        cachedCount: cachedMap.size - uncachedCandidates.length,
        freshCount: uncachedCandidates.length,
      },
      {
        headers: {
          "Cache-Control": "private, s-maxage=300, stale-while-revalidate=1800",
          "x-pulse-cache":
            cachedMap.size > uncachedCandidates.length ? "PARTIAL_HIT" : "MISS",
        },
      }
    );
  } catch (err) {
    console.error("Pulse report failed", err);
    return reuseCachedPulse(candidates, cachedMap, headlines);
  } finally {
    if (heldSlot) endBackgroundLlm();
  }
}
