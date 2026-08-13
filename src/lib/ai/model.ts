import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";

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

function hasKey(name: string): boolean {
  const v = process.env[name];
  return Boolean(v && v !== "your_key_here");
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

export type AdvisorProviderId = "openrouter" | "groq" | "gemini" | "cerebras";

export type AdvisorProviderCandidate = {
  id: AdvisorProviderId;
  model: LanguageModel;
};

/**
 * Full ordered chain of every CONFIGURED free-tier provider — OpenRouter
 * (with its own internal free-model list fallback), then Groq, Gemini, and
 * Cerebras, each only included when its API key is set. Every tier here is
 * a free tier; add resilience by getting a free key, not by paying anyone.
 *
 * Vision requests skip Groq/Cerebras (their hosted OSS models are
 * text-only) and go OpenRouter -> Gemini, since Gemini is natively
 * multimodal.
 */
export function buildAdvisorProviderChain(options?: {
  vision?: boolean;
  reasoning?: boolean;
}): AdvisorProviderCandidate[] {
  const vision = Boolean(options?.vision) && !options?.reasoning;
  const chain: AdvisorProviderCandidate[] = [];

  if (hasKey("OPENROUTER_API_KEY")) {
    const modelId = resolveAdvisorModelId(options);
    const fallbacks = resolveAdvisorFallbackIds(options);
    const openrouter = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
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
    chain.push({ id: "openrouter", model: openrouter.chat(modelId) });
  }

  if (hasKey("GROQ_API_KEY") && !vision) {
    const groq = createOpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
    // gpt-oss is Groq's only model family with guaranteed json_schema
    // support — llama-3.3-70b-versatile 400s on any structured
    // (generateObject) call, which would silently break this as a
    // fallback for forecast/thesis-pulse/margus-fund without ever
    // touching the plain-text chat path (confirmed against the live API).
    const groqModel = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
    chain.push({ id: "groq", model: groq.chat(groqModel) });
  }

  if (hasKey("GEMINI_API_KEY")) {
    const gemini = createOpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
    // Rolling alias, not a dated snapshot — Google retires dated model
    // IDs over time (gemini-2.5-flash 404s on some key tiers already),
    // -latest keeps pointing at whatever's current without needing a
    // code change every time Google ships a new generation.
    const geminiModel = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
    chain.push({ id: "gemini", model: gemini.chat(geminiModel) });
  }

  if (hasKey("CEREBRAS_API_KEY") && !vision) {
    const cerebras = createOpenAI({
      apiKey: process.env.CEREBRAS_API_KEY,
      baseURL: "https://api.cerebras.ai/v1",
    });
    // llama-3.3-70b no longer exists on Cerebras's catalog (confirmed
    // 404 against the live API) — gpt-oss-120b is their current
    // production model and matches Groq's structured-output-safe choice.
    const cerebrasModel = process.env.CEREBRAS_MODEL ?? "gpt-oss-120b";
    chain.push({ id: "cerebras", model: cerebras.chat(cerebrasModel) });
  }

  return chain;
}

/**
 * CC Advisor model via OpenAI-compatible providers — single-model resolve,
 * kept for callers that just need "the primary model" (e.g. a pre-flight
 * key check). Prefer `buildAdvisorProviderChain` + `withProviderFallback` /
 * `pickStreamingProvider` for actual requests so a rate-limited/expired
 * provider doesn't take Margus down entirely.
 */
export function resolveAdvisorModel(options?: {
  vision?: boolean;
  reasoning?: boolean;
}): LanguageModel {
  const chain = buildAdvisorProviderChain(options);
  const primary = chain[0];
  if (!primary) {
    throw new Error(
      "No LLM key configured. Set OPENROUTER_API_KEY (or GROQ_API_KEY / GEMINI_API_KEY / CEREBRAS_API_KEY) in .env.local."
    );
  }
  return primary.model;
}

/**
 * Try a non-streaming call (generateText / generateObject) against each
 * configured provider in order, moving to the next on any failure —
 * OpenRouter's account-wide daily quota running out no longer means Margus
 * is down if Groq/Gemini/Cerebras are also configured.
 */
export type AdvisorFallbackOptions = {
  /**
   * Epoch ms the whole chain must finish by. Without this, walking 3
   * providers that each retry twice can outlive the route's maxDuration, at
   * which point the platform kills the function and serves its own
   * plain-text timeout page instead of our JSON error. Each attempt gets a
   * slice of whatever budget is left, and no new provider starts once the
   * budget is gone, so the route always lives long enough to answer.
   */
  deadlineAt?: number;
  /** Caller's own cancellation, usually the incoming request's signal. */
  signal?: AbortSignal;
};

/** Below this there isn't enough time left for a call to plausibly land. */
const MIN_ATTEMPT_MS = 5_000;

function attemptSignal(
  caller: AbortSignal | undefined,
  budgetMs: number | null
): AbortSignal | undefined {
  if (budgetMs == null) return caller;
  const timeout = AbortSignal.timeout(budgetMs);
  return caller ? AbortSignal.any([caller, timeout]) : timeout;
}

export async function withAdvisorFallback<T>(
  chain: AdvisorProviderCandidate[],
  fn: (
    model: LanguageModel,
    providerId: AdvisorProviderId,
    signal?: AbortSignal
  ) => Promise<T>,
  opts?: AdvisorFallbackOptions
): Promise<T> {
  if (chain.length === 0) {
    throw new Error(
      "No LLM key configured. Set OPENROUTER_API_KEY (or GROQ_API_KEY / GEMINI_API_KEY / CEREBRAS_API_KEY) in .env.local."
    );
  }
  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    const candidate = chain[i]!;

    // The caller gave up (client disconnected, request aborted). Failing
    // over to another provider would just burn quota answering nobody.
    if (opts?.signal?.aborted) {
      throw opts.signal.reason ?? new Error("Request aborted");
    }

    const remaining =
      opts?.deadlineAt != null ? opts.deadlineAt - Date.now() : null;

    if (remaining != null && remaining < MIN_ATTEMPT_MS && i > 0) {
      console.error(
        `[ai] out of time budget after "${chain[i - 1]!.id}", skipping ${
          chain.length - i
        } remaining provider(s)`
      );
      break;
    }

    // Split what's left across the providers still to try, so one hung
    // provider can't spend the entire budget on its own.
    const slice =
      remaining == null
        ? null
        : Math.max(MIN_ATTEMPT_MS, Math.floor(remaining / (chain.length - i)));

    try {
      return await fn(
        candidate.model,
        candidate.id,
        attemptSignal(opts?.signal, slice)
      );
    } catch (err) {
      console.error(`[ai] provider "${candidate.id}" failed`, err);
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("AI request timed out before any provider replied");
}

/**
 * Streaming needs a provider chosen BEFORE `streamText` starts (there's no
 * clean way to swap providers mid-stream once bytes are flowing to the
 * client). Runs a cheap, tiny probe request against each candidate in
 * order and caches the first one that works for a few minutes per cache
 * key, so most requests pay zero extra latency and only re-probe
 * occasionally or right after a real failure.
 */
const streamingProviderCache = new Map<
  string,
  { candidate: AdvisorProviderCandidate; at: number }
>();
const STREAMING_PROVIDER_CACHE_TTL_MS = 5 * 60 * 1000;
// Vision requests (screenshot import) are rare enough that re-probing every
// time is cheap, and a free vision model going degraded/rate-limited
// upstream mid-window is common enough that trusting a 5-minute-old "this
// one works" verdict risks silently eating a real user action (add this
// holding) rather than just costing an extra second on a chat reply.
const VISION_STREAMING_PROVIDER_CACHE_TTL_MS = 30 * 1000;

export async function pickStreamingProvider(
  chain: AdvisorProviderCandidate[],
  cacheKey: string
): Promise<AdvisorProviderCandidate> {
  if (chain.length === 0) {
    throw new Error(
      "No LLM key configured. Set OPENROUTER_API_KEY (or GROQ_API_KEY / GEMINI_API_KEY / CEREBRAS_API_KEY) in .env.local."
    );
  }
  // Nothing to choose between — skip the probe entirely so the common
  // today (single provider configured) case pays zero extra latency.
  if (chain.length === 1) return chain[0]!;

  const ttl = cacheKey.includes("vision")
    ? VISION_STREAMING_PROVIDER_CACHE_TTL_MS
    : STREAMING_PROVIDER_CACHE_TTL_MS;
  const cached = streamingProviderCache.get(cacheKey);
  if (
    cached &&
    Date.now() - cached.at < ttl &&
    chain.some((c) => c.id === cached.candidate.id)
  ) {
    return cached.candidate;
  }

  let lastErr: unknown;
  for (const candidate of chain) {
    try {
      await generateText({
        model: candidate.model,
        prompt: "ping",
        maxOutputTokens: 4,
      });
      streamingProviderCache.set(cacheKey, { candidate, at: Date.now() });
      return candidate;
    } catch (err) {
      console.error(`[ai] streaming probe for "${candidate.id}" failed`, err);
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Invalidate a cached streaming provider choice — call after a real request
 * against it fails, so the next request re-probes instead of repeating it. */
export function invalidateStreamingProvider(cacheKey: string) {
  streamingProviderCache.delete(cacheKey);
}

/**
 * Classify a thrown LLM/provider error into a user-facing message + HTTP
 * status. OpenRouter's free-models-per-day cap is account-wide (shared
 * across every `:free` model), so falling back to a different free OpenRouter
 * model can't help there — Margus instead falls through to a different
 * PROVIDER (Groq/Gemini/Cerebras) when one is configured.
 */
export function describeAdvisorError(err: unknown): {
  message: string;
  status: number;
} {
  const msg = err instanceof Error ? err.message : String(err ?? "");

  if (/free-models-per-day|models-per-day/i.test(msg)) {
    return {
      message:
        "OpenRouter's free daily AI quota is used up for today. This is shared across every free model, so switching models won't help. It resets ~daily, adding a Groq/Gemini/Cerebras free key gives Margus a fallback for this, or add credits at openrouter.ai/credits to raise the cap to 1000/day.",
      status: 429,
    };
  }
  if (/rate.?limit|429|temporar/i.test(msg)) {
    return {
      message:
        "Model is busy / rate-limited. Wait a few seconds and try again. Margus will auto-fallback to another provider when one is configured.",
      status: 429,
    };
  }
  if (/timeout|504|timed out/i.test(msg)) {
    return {
      message: "Model timed out. Try again, free models are flaky under load.",
      status: 504,
    };
  }
  if (/OPENROUTER|GROQ|GEMINI|CEREBRAS|API key|503|LLM/i.test(msg)) {
    return {
      message:
        "Missing LLM API key. Add OPENROUTER_API_KEY (or GROQ_API_KEY / GEMINI_API_KEY / CEREBRAS_API_KEY) to .env.local, then restart the dev server.",
      status: 503,
    };
  }
  if (/network|fetch|Failed to fetch|Load failed|aborted/i.test(msg)) {
    return {
      message: "Connection dropped. Refresh the page and try again.",
      status: 502,
    };
  }
  return { message: msg || "AI request failed", status: 500 };
}

export function advisorProviderLabel(): string {
  const chain = buildAdvisorProviderChain();
  if (chain.length === 0) return "none";
  const labels: Record<AdvisorProviderId, string> = {
    openrouter: "OpenRouter",
    groq: "Groq",
    gemini: "Gemini",
    cerebras: "Cerebras",
  };
  return chain.map((c) => labels[c.id]).join(" → ");
}
