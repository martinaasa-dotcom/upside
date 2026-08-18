import {
  checkRateLimit,
  type RateLimitResult,
} from "@/lib/rate-limit";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { isRecord, readFiniteNumber } from "@/lib/unknown";

/**
 * In-memory first (cheap), then the Postgres bucket so two warm instances
 * cannot each serve a full LLM quota. If the RPC is missing or down, the
 * memory result stands. Never fail closed on infra.
 */
export async function takeDurableRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const mem = checkRateLimit(key, limit, windowMs);
  if (!mem.ok) return mem;
  if (!supabaseUsesServiceRole()) return mem;
  const admin = getSupabaseServer();
  if (!admin) return mem;
  try {
    const { data, error } = await admin.rpc("portfell_rate_take", {
      p_key: key,
      p_limit: limit,
      p_window_ms: windowMs,
    });
    if (error || data == null) return mem;
    if (!isRecord(data) || data.ok !== false) return mem;
    const retry = readFiniteNumber(data.retryAfterSec);
    return {
      ok: false,
      retryAfterSec: retry != null && retry > 0 ? Math.ceil(retry) : 60,
    };
  } catch {
    return mem;
  }
}
