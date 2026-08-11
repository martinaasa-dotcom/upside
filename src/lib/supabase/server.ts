import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerAuth } from "@/lib/supabase/server-auth";

/**
 * Server Supabase client. Prefer service role so RLS can deny anon writes;
 * fall back to anon for read-only / legacy setups.
 */
export function getSupabaseServer(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function supabaseUsesServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/**
 * Data client for API routes: service role when configured, otherwise the
 * signed-in user's cookie session (so RLS + owner_id filters both work).
 */
export async function getSupabaseDataClient(): Promise<SupabaseClient | null> {
  if (supabaseUsesServiceRole()) return getSupabaseServer();
  return createSupabaseServerAuth();
}
