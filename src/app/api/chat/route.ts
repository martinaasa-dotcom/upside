import {
  buildCcSystemPrompt,
  ccAdvisorTools,
  type CcChatContext,
} from "@/lib/ai/cc-advisor";
import { resolveAdvisorModel } from "@/lib/ai/model";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";

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
    const tools = adviseOnly ? undefined : ccAdvisorTools;

    const result = streamText({
      model: resolveAdvisorModel({ vision }),
      system: buildCcSystemPrompt(ccContext),
      messages: await convertToModelMessages(messages, {
        tools,
      }),
      tools,
      stopWhen: stepCountIs(adviseOnly ? 3 : 12),
      maxRetries: 2,
      abortSignal: req.signal,
      onError: ({ error }) => {
        console.error("[chat]", error);
      },
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        const msg =
          error instanceof Error ? error.message : "Chat request failed";
        if (/rate.?limit|429|temporar/i.test(msg)) {
          return "Model is rate-limited right now. Wait a few seconds and try again, or switch MODEL in .env.local.";
        }
        if (/timeout|504|timed out/i.test(msg)) {
          return "Model timed out. Try again — free models are flaky under load.";
        }
        return msg;
      },
    });
  } catch (err) {
    console.error("[chat]", err);
    const msg =
      err instanceof Error
        ? err.message
        : "Chat failed — try again or switch MODEL in .env.local";
    return Response.json({ error: msg }, { status: 500 });
  }
}
