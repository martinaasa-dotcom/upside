import { createClient } from "@supabase/supabase-js";
import type { AppSupabaseClient } from "@/lib/supabase/client-types";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerAuth } from "@/lib/supabase/server-auth";
import {
  supabaseAnonKey,
  supabaseServiceRoleKey,
  supabaseUrl,
} from "@/lib/supabase/env";

export type { AppSupabaseClient };

/**
 * Server Supabase client. Prefer service role so RLS can deny anon writes;
 * fall back to anon for read-only / legacy setups.
 */
export function getSupabaseServer(): AppSupabaseClient | null {
  const url = supabaseUrl();
  const serviceKey = supabaseServiceRoleKey();
  const anonKey = supabaseAnonKey();
  const key = serviceKey || anonKey;
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
