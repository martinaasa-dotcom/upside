import { createClient } from "@supabase/supabase-js";
import type { AppSupabaseClient } from "@/lib/supabase/client-types";
import type { Database } from "@/lib/supabase/database.types";
import { supabaseFetch } from "@/lib/supabase/http";
import { createSupabaseServerAuth } from "@/lib/supabase/server-auth";
import {
  supabaseAnonKey,
  supabaseServiceRoleKey,
  supabaseUrl,
} from "@/lib/supabase/env";

export type { AppSupabaseClient };

let cached: { url: string; key: string; client: AppSupabaseClient } | null =
  null;

/**
 * Server Supabase client. Prefer service role so RLS can deny anon writes;
 * fall back to anon for read-only / legacy setups.
 *
 * One client per isolate. supabase-js talks HTTP to PostgREST, which already
 * uses the transaction-mode pooler. Reusing the client keeps fetch sockets
 * pooled across Fluid Compute invocations; a timeout on every call means a
 * hung request cannot pin a pooler slot.
 */
export function getSupabaseServer(): AppSupabaseClient | null {
  const url = supabaseUrl();
  const serviceKey = supabaseServiceRoleKey();
  const anonKey = supabaseAnonKey();
  const key = serviceKey || anonKey;
  if (!url || !key) return null;
  if (cached && cached.url === url && cached.key === key) return cached.client;
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: supabaseFetch },
  });
  cached = { url, key, client };
  return client;
}

export function supabaseUsesServiceRole(): boolean {
  return Boolean(supabaseServiceRoleKey());
}

/**
 * Data client for API routes: service role when configured, otherwise the
 * signed-in user's cookie session (so RLS + owner_id filters both work).
 */
export async function getSupabaseDataClient(): Promise<AppSupabaseClient | null> {
  if (supabaseUsesServiceRole()) return getSupabaseServer();
  return createSupabaseServerAuth();
}
