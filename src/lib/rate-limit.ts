/**
 * Best-effort in-memory rate limiter for API routes that hit shared,
 * cost-sensitive resources (free-tier LLM quotas, market data providers).
 *
 * This is per-warm-instance, not a distributed limiter — on Vercel a burst
 * spread across multiple cold instances can slip past it. That's an
 * accepted tradeoff for a project with no Redis/KV yet: it still reliably
 * catches the most common real-world abuse pattern (a retry loop or script
 * hammering one endpoint), at zero added infra or cost. Swap for
 * Upstash/Vercel KV if usage ever justifies it.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;
/** Cap so a unique-key flood cannot grow this Map without bound. */
const MAX_BUCKETS = 10_000;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  /** Seconds until the caller can retry, only set when ok is false. */
  retryAfterSec?: number;
};

/**
 * @param key Unique identifier for the caller + endpoint, e.g. `chat:${userId}`.
 * @param limit Max requests allowed within the window.
 * @param windowMs Window length in milliseconds.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
    sweep(now);
    if (buckets.size >= MAX_BUCKETS) {
      const first = buckets.keys().next().value;
      if (first !== undefined) buckets.delete(first);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true };
}
