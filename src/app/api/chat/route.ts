import {
  buildCcSystemPrompt,
  buildCcAdvisorTools,
  type CcChatContext,
} from "@/lib/ai/cc-advisor";
import {
  buildAdvisorProviderChain,
  describeAdvisorError,
  invalidateStreamingProvider,
  markProviderUnhealthy,
  pickStreamingProvider,
} from "@/lib/ai/model";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";

export const maxDuration = 120;

function messagesHaveImages(messages: UIMessage[]): boolean {
  return messages.some((m) =>
    (m.parts ?? []).some(
      (p) =>
        p.type === "file" &&
        "mediaType" in p &&
        typeof p.mediaType === "string" &&
        p.mediaType.startsWith("image/")
    )
  );
}

export async function POST(req: Request) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const limit = checkRateLimit(`chat:${auth.user.id}`, 30, 5 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You're sending messages faster than Margus can keep up. Give it a few seconds." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec ?? 15) } }
    );
  }

  try {
    const body = await req.json();
    const messages = body.messages as UIMessage[];
    const ccContext = (body.ccContext ?? {
      portfolioName: "Portfolio",
      cashBalance: 0,
      holdings: [],
      rows: [],
      totals: {
        cost: 0,
        value: 0,
        roiPct: 0,
        roiDollar: 0,
        yield2wAvg: 0,
        premiumTotal: 0,
      },
      otherPortfolios: [],
    }) as CcChatContext;

    const vision = messagesHaveImages(messages);
    const adviseOnly = Boolean(ccContext.adviseOnly);
    const tools = adviseOnly
      ? undefined
      : buildCcAdvisorTools(
          {
            eurUsd: ccContext.eurUsd ?? null,
            gbpUsd: ccContext.gbpUsd ?? null,
          },
          { hideOptions: Boolean(ccContext.hideOptions) }
        );

    const providerChain = buildAdvisorProviderChain({ vision });
    if (providerChain.length === 0) {
      const { message } = describeAdvisorError(
        new Error("No LLM key configured")
      );
      return Response.json({ error: message }, { status: 503 });
    }
    const cacheKey = vision ? "chat:vision" : "chat:text";
    const provider = await pickStreamingProvider(providerChain, cacheKey);

    const result = streamText({
      model: provider.model,
      system: buildCcSystemPrompt(ccContext),
      messages: await convertToModelMessages(messages, {
        tools,
      }),
      tools,
      // Vision+tools: keep reasoning short so free omni models don't burn the budget and go silent
      ...(vision
        ? {
            providerOptions: {
              openrouter: {
                reasoning: { effort: "low", max_tokens: 400 },
              },
            },
            // Force at least one tool when the user sent an image (import / add holding)
            ...(adviseOnly
              ? {}
              : { toolChoice: "required" as const }),
          }
        : {}),
      stopWhen: stepCountIs(adviseOnly ? 3 : vision ? 8 : 12),
      // Retrying a rate-limited provider three more times just deepens the
      // limit and makes the user wait for four identical failures. One
      // retry covers a genuine blip; anything worse should move providers,
      // which the cooldown below arranges for the next message.
      maxRetries: 1,
      abortSignal: req.signal,
      onError: ({ error }) => {
        console.error(`[chat] provider "${provider.id}" stream error`, error);
        invalidateStreamingProvider(cacheKey);
        // The probe is a 4-token ping that a rate-limited provider still
        // answers, so without this the same exhausted provider gets
        // re-picked on the retry and fails again.
        const { status } = describeAdvisorError(error);
        if (status === 429 || status === 503) markProviderUnhealthy(provider.id);
      },
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => describeAdvisorError(error).message,
    });
  } catch (err) {
    console.error("[chat]", err);
    const { message, status } = describeAdvisorError(err);
    return Response.json({ error: message }, { status });
  }
}
