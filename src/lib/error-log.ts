import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

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
};

/**
 * Best-effort error logging to Supabase — never throws, so a broken error
 * reporter can't itself take down the request/render it's trying to report
 * on. Uses getSupabaseServer() (env-var only, no cookies()) rather than
 * getSupabaseDataClient() so this also works from instrumentation.ts,
 * which runs outside any per-request session context.
 */
export async function logError(entry: ErrorLogEntry): Promise<void> {
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
      context: entry.context ?? null,
    });
  } catch {
    // Logging the error is best-effort only — swallow so a Supabase blip
    // doesn't compound the original problem.
  }
}
