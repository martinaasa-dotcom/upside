import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

const DEFAULT_TEXT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
/**
 * Vision + tools. Prefer a capable omni model; reasoning budget is capped in /api/chat
 * so screenshot→importSheet doesn't stall on endless thinking.
 */
const DEFAULT_VISION_MODEL =
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";

/** Free-tier backups when the primary OpenRouter model is rate-limited / down. */
const DEFAULT_TEXT_FALLBACKS = [
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "openai/gpt-oss-20b:free",
  "qwen/qwen3-14b:free",
];

const DEFAULT_VISION_FALLBACKS = [
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "google/gemini-2.0-flash-exp:free",
];

function parseEnvList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function uniq(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function resolveAdvisorModelId(options?: {
  vision?: boolean;
  reasoning?: boolean;
}): string {
  const vision = Boolean(options?.vision) && !options?.reasoning;
  if (vision) {
    return (
      process.env.MODEL_VISION ??
      process.env.OPENROUTER_VISION_MODEL ??
      DEFAULT_VISION_MODEL
    );
  }
  if (options?.reasoning) {
    return (
      process.env.MODEL_FORECAST ??
      process.env.MODEL ??
      process.env.OPENROUTER_MODEL ??
      DEFAULT_TEXT_MODEL
    );
  }
  return (
    process.env.MODEL ?? process.env.OPENROUTER_MODEL ?? DEFAULT_TEXT_MODEL
  );
}

/** OpenRouter `models` fallbacks (excludes primary). */
export function resolveAdvisorFallbackIds(options?: {
  vision?: boolean;
  reasoning?: boolean;
}): string[] {
  const primary = resolveAdvisorModelId(options);
  const vision = Boolean(options?.vision) && !options?.reasoning;
  const fromEnv = parseEnvList(
    vision
      ? process.env.MODEL_VISION_FALLBACKS ?? process.env.MODEL_FALLBACKS
      : process.env.MODEL_FALLBACKS
  );
  const defaults = vision ? DEFAULT_VISION_FALLBACKS : DEFAULT_TEXT_FALLBACKS;
  return uniq([...fromEnv, ...defaults]).filter((id) => id !== primary);
}

/**
 * Inject OpenRouter `models` fallbacks into chat/completions JSON bodies.
 * Rate-limits / downtime on the primary then walk the chain server-side.
 */
function openRouterFetchWithFallbacks(
  fallbacks: string[]
): typeof fetch | undefined {
  if (!fallbacks.length) return undefined;
  return async (input, init) => {
    try {
      if (init?.body && typeof init.body === "string") {
        const parsed = JSON.parse(init.body) as Record<string, unknown>;
        if (!Array.isArray(parsed.models)) {
          parsed.models = fallbacks;
          init = { ...init, body: JSON.stringify(parsed) };
        }
      }
    } catch {
      /* leave body alone */
    }
    return fetch(input, init);
  };
}

/**
 * CC Advisor model via OpenAI-compatible providers.
 *
 * Priority:
 * 1. OpenRouter (OPENROUTER_API_KEY) → https://openrouter.ai/api/v1
 * 2. Groq (GROQ_API_KEY) → https://api.groq.com/openai/v1
 */
export function resolveAdvisorModel(options?: {
  vision?: boolean;
  reasoning?: boolean;
}): LanguageModel {
  const modelId = resolveAdvisorModelId(options);
  const fallbacks = resolveAdvisorFallbackIds(options);

  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey && openrouterKey !== "your_key_here") {
    const openrouter = createOpenAI({
      apiKey: openrouterKey,
      baseURL: "https://openrouter.ai/api/v1",
      headers: {
        "HTTP-Referer":
          process.env.OPENROUTER_HTTP_REFERER ??
          "https://upside-upthink-solutions.vercel.app",
        "X-Title":
          process.env.OPENROUTER_APP_TITLE ?? "Upside Assistant Margus",
      },
      fetch: openRouterFetchWithFallbacks(fallbacks),
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
