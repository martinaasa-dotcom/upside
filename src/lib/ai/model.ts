import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

const DEFAULT_TEXT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
/** Vision + tools — used when the user pastes/attaches screenshots */
const DEFAULT_VISION_MODEL =
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";

/**
 * CC Advisor model via OpenAI-compatible providers.
 *
 * Priority:
 * 1. OpenRouter (OPENROUTER_API_KEY) → https://openrouter.ai/api/v1
 * 2. Groq (GROQ_API_KEY) → https://api.groq.com/openai/v1
 */
export function resolveAdvisorModel(options?: {
  vision?: boolean;
}): LanguageModel {
  const vision = Boolean(options?.vision);
  const modelId = vision
    ? (process.env.MODEL_VISION ??
      process.env.OPENROUTER_VISION_MODEL ??
      DEFAULT_VISION_MODEL)
    : (process.env.MODEL ??
      process.env.OPENROUTER_MODEL ??
      DEFAULT_TEXT_MODEL);

  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey && openrouterKey !== "your_key_here") {
    const openrouter = createOpenAI({
      apiKey: openrouterKey,
      baseURL: "https://openrouter.ai/api/v1",
      headers: {
        "HTTP-Referer":
          process.env.OPENROUTER_HTTP_REFERER ??
          "https://upside-upthink1.vercel.app",
        "X-Title":
          process.env.OPENROUTER_APP_TITLE ?? "Upside Assistant Margus",
      },
    });
    return openrouter.chat(modelId);
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey && groqKey !== "your_key_here") {
    const groq = createOpenAI({
      apiKey: groqKey,
      baseURL: "https://api.groq.com/openai/v1",
    });
    const groqModel =
      process.env.MODEL?.includes("/")
        ? (process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile")
        : (process.env.MODEL ??
          process.env.GROQ_MODEL ??
          "llama-3.3-70b-versatile");
    return groq.chat(groqModel);
  }

  throw new Error(
    "No LLM key configured. Set OPENROUTER_API_KEY (or GROQ_API_KEY) in .env.local."
  );
}

export function advisorProviderLabel(): string {
  if (
    process.env.OPENROUTER_API_KEY &&
    process.env.OPENROUTER_API_KEY !== "your_key_here"
  ) {
    return "OpenRouter";
  }
  if (
    process.env.GROQ_API_KEY &&
    process.env.GROQ_API_KEY !== "your_key_here"
  ) {
    return "Groq";
  }
  return "none";
}
