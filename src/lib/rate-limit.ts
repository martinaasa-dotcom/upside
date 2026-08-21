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
 * @param limit Max units allowed within the window.
 * @param windowMs Window length in milliseconds.
 * @param cost How many units this call consumes. Defaults to 1, which is
 *   plain request counting. Pass a real weight when one request can cost
 *   far more than another -- a quote request's true cost is per ticker, not
 *   per request. Pass 0 to peek: report whether the bucket is already over
 *   its limit without consuming anything or creating a bucket.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  cost = 1
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const charge = Math.max(0, Math.floor(cost));

  // Peek. Deliberately does not create a bucket, so checking cannot itself
  // fill the Map, and an unknown key always reads as allowed.
  if (charge === 0) {
    const existing = buckets.get(key);
    if (!existing || now >= existing.resetAt || existing.count < limit) {
      return { ok: true };
    }
    return {
      ok: false,
      retryAfterSec: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
    sweep(now);
    if (buckets.size >= MAX_BUCKETS) {
      const first = buckets.keys().next().value;
      if (first !== undefined) buckets.delete(first);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: charge, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += charge;
  return { ok: true };
}

/**
 * Record that a shared limiter has already refused this key, so this
 * instance stops asking.
 *
 * The durable limiter is the source of truth across instances, but reaching
 * it costs a round trip. When it says no, writing that verdict into local
 * memory means every later request from the same caller to this instance is
 * refused for free until the window expires.
 */
export function markRateLimited(key: string, retryAfterSec: number) {
  const seconds = Math.max(1, Math.ceil(retryAfterSec));
  buckets.set(key, {
    // Above any limit this key could be checked against.
    count: Number.MAX_SAFE_INTEGER,
    resetAt: Date.now() + seconds * 1000,
  });
}

/** Client IP as Vercel sets it. First hop is the platform, so this is trustworthy on Vercel. */
export function clientIp(req: Request): string {
  const vercel = req.headers
    .get("x-vercel-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = req.headers.get("x-real-ip")?.trim();
  return vercel || forwarded || real || "unknown";
}

const MUTATION = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const TIGHT_PATHS = [
  "/api/auth",
  "/api/account/delete",
  "/api/account/export",
  "/api/user/export",
  "/api/communities/join",
  "/api/portfolios/join",
  "/api/demo/lock",
  "/api/internal/log-error",
  "/api/internal/telemetry",
];

function normalizeApiPath(pathname: string): string {
  return pathname.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
    ":id"
  );
}

function isTightPath(pathname: string): boolean {
  return TIGHT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Route-level cap for auth and mutation APIs. Returns null when the
 * request is not in scope (GET reads, cron). Callers still keep tighter
 * per-user limits on LLM endpoints.
 */
export function limitMutationRequest(req: Request): RateLimitResult | null {
  const method = req.method.toUpperCase();
  let pathname = "/";
  try {
    pathname = new URL(req.url).pathname;
  } catch {
    return null;
  }
  if (pathname.startsWith("/api/cron/")) return null;

  const joinPeek = method === "GET" && pathname === "/api/communities/join";
  const exportGet =
    method === "GET" &&
    (pathname === "/api/account/export" || pathname === "/api/user/export");
  if (!MUTATION.has(method) && !joinPeek && !exportGet) return null;

  const tight = joinPeek || exportGet || isTightPath(pathname);
  return checkRateLimit(
    `api:${method}:${normalizeApiPath(pathname)}:${clientIp(req)}`,
    tight ? 20 : 120,
    60_000
  );
}

function isPublicMarketPath(pathname: string): boolean {
  return pathname === "/api/quotes" || pathname.startsWith("/api/market/");
}

/**
 * GET quote and ticker-search endpoints are unauthenticated. Cap by IP so
 * a scrape loop cannot burn the Yahoo/Twelve Data fallbacks. Memory only;
 * the CDN still absorbs repeats of the same URL.
 */
export function limitPublicMarketRequest(req: Request): RateLimitResult | null {
  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;
  let pathname = "/";
  try {
    pathname = new URL(req.url).pathname;
  } catch {
    return null;
  }
  if (!isPublicMarketPath(pathname)) return null;
  return checkRateLimit(`mkt:${clientIp(req)}`, 120, 60_000);
}

export function rateLimitJson(
  limit: RateLimitResult,
  error: string
): Response {
  return Response.json(
    { error },
    {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSec ?? 60) },
    }
  );
}
