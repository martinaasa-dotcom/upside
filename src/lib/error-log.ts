import type { Json } from "@/lib/supabase/database.types";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { logEvent, sanitizeContext } from "@/lib/telemetry";

export type ErrorLogEntry = {
  source: "client" | "server";
  message: string;
  stack?: string | null;
  digest?: string | null;
  path?: string | null;
  routeType?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  userAgent?: string | null;
  context?: Record<string, unknown> | null;
  /** Structured log event name. Defaults to "error". */
  event?: string;
};

/**
 * Best-effort error logging to Supabase — never throws, so a broken error
 * reporter can't itself take down the request/render it's trying to report
 * on. Uses getSupabaseServer() (env-var only, no cookies()) rather than
 * getSupabaseDataClient() so this also works from instrumentation.ts,
 * which runs outside any per-request session context.
 */
export async function logError(entry: ErrorLogEntry): Promise<void> {
  const context = sanitizeContext(entry.context);
  logEvent(
    entry.event ?? "error",
    {
      source: entry.source,
      message: entry.message,
      path: entry.path ?? null,
      routeType: entry.routeType ?? null,
      digest: entry.digest ?? null,
      userId: entry.userId ?? null,
      context,
    },
    "error"
  );
  try {
    const supabase = getSupabaseServer();
    if (!supabase) return;
    await supabase.from(PORTFELL_TABLES.errorLog).insert({
      source: entry.source,
      message: entry.message.slice(0, 4000),
      stack: entry.stack?.slice(0, 8000) ?? null,
      digest: entry.digest ?? null,
      path: entry.path?.slice(0, 500) ?? null,
      route_type: entry.routeType ?? null,
      user_id: entry.userId ?? null,
      user_email: entry.userEmail ?? null,
      user_agent: entry.userAgent?.slice(0, 500) ?? null,
      context: (context as Json | null) ?? null,
    });
  } catch {
    // Logging the error is best-effort only — swallow so a Supabase blip
    // doesn't compound the original problem.
  }
}
