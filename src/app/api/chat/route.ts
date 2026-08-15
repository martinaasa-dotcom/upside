import {
  buildCcSystemPrompt,
  buildCcAdvisorTools,
  type CcChatContext,
} from "@/lib/ai/cc-advisor";
import { markChatActive } from "@/lib/ai/llm-slots";
import {
  buildAdvisorProviderChain,
  invalidateStreamingProvider,
  isTransientAdvisorFailure,
  markProviderUnhealthy,
  pickStreamingProvider,
  rememberStreamingProvider,
} from "@/lib/ai/model";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type TextStreamPart,
  type ToolSet,
  type UIMessage,
} from "ai";
import { NextResponse } from "next/server";

export const maxDuration = 120;

const FALLBACK_CHAT_TEXT = "Didn't land. Send it again.";

type StreamPart = { type: string };

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

function fallbackChatResponse(): Response {
  const id = "text-fallback";
  const stream = createUIMessageStream({
    execute({ writer }) {
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: FALLBACK_CHAT_TEXT });
      writer.write({ type: "text-end", id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

const USEFUL_PART = new Set([
  "text-delta",
  "reasoning-delta",
  "tool-call",
  "tool-input-start",
  "tool-call-streaming-start",
  "tool-input-delta",
]);

async function peekUntilUseful(stream: AsyncIterable<StreamPart>): Promise<
  | { ok: true; prefix: StreamPart[]; iterator: AsyncIterator<StreamPart> }
  | { ok: false }
> {
  const iterator = stream[Symbol.asyncIterator]();
  const prefix: StreamPart[] = [];
  for (let i = 0; i < 40; i++) {
    const step = await iterator.next();
    if (step.done) return { ok: false };
    const part = step.value;
    prefix.push(part);
    if (part.type === "error") return { ok: false };
    if (USEFUL_PART.has(part.type)) {
      return { ok: true, prefix, iterator };
    }
  }
  return { ok: true, prefix, iterator };
}

function replayParts(
  prefix: StreamPart[],
  iterator: AsyncIterator<StreamPart>
): ReadableStream<TextStreamPart<ToolSet>> {
  return new ReadableStream({
    async start(controller) {
      try {
        for (const part of prefix) {
          controller.enqueue(part as TextStreamPart<ToolSet>);
        }
        while (true) {
          const step = await iterator.next();
          if (step.done) break;
          controller.enqueue(step.value as TextStreamPart<ToolSet>);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
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
  markChatActive();

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
      return fallbackChatResponse();
    }
    const cacheKey = vision ? "chat:vision" : "chat:text";
    const modelMessages = await convertToModelMessages(messages, { tools });
    const tried = new Set<string>();

    while (tried.size < providerChain.length) {
      let provider;
      try {
        provider = pickStreamingProvider(providerChain, cacheKey);
      } catch (err) {
        console.error("[chat] no streaming provider available", err);
        break;
      }
      if (tried.has(provider.id)) break;
      tried.add(provider.id);

      try {
        const result = streamText({
          model: provider.model,
          system: buildCcSystemPrompt(ccContext),
          messages: modelMessages,
          tools,
          ...(vision
            ? {
                providerOptions: {
                  openrouter: {
                    reasoning: { effort: "low", max_tokens: 400 },
                  },
                },
                ...(adviseOnly ? {} : { toolChoice: "required" as const }),
              }
            : {}),
          stopWhen: stepCountIs(adviseOnly ? 3 : vision ? 8 : 12),
          maxRetries: 1,
          abortSignal: req.signal,
          onError: ({ error }) => {
            console.error(`[chat] provider "${provider.id}" stream error`, error);
            invalidateStreamingProvider(cacheKey);
            if (isTransientAdvisorFailure(error)) {
              markProviderUnhealthy(provider.id);
            }
          },
        });

        const peeked = await peekUntilUseful(result.fullStream);
        if (!peeked.ok) {
          console.error(`[chat] provider "${provider.id}" died before the first token`);
          invalidateStreamingProvider(cacheKey);
          markProviderUnhealthy(provider.id);
          continue;
        }

        rememberStreamingProvider(cacheKey, provider);
        return createUIMessageStreamResponse({
          stream: toUIMessageStream({
            stream: replayParts(peeked.prefix, peeked.iterator),
            tools,
            onError: () => FALLBACK_CHAT_TEXT,
          }),
        });
      } catch (err) {
        console.error(`[chat] provider "${provider.id}" failed to start`, err);
        invalidateStreamingProvider(cacheKey);
        markProviderUnhealthy(provider.id);
        if (req.signal.aborted) throw err;
      }
    }

    return fallbackChatResponse();
  } catch (err) {
    console.error("[chat]", err);
    return fallbackChatResponse();
  }
}
