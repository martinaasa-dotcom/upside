/**
 * Dedicated Upside Lab Supabase instance.
 *
 * Client code must keep using the NEXT_PUBLIC_ names (bundled into the
 * browser). Server code accepts the isolated aliases too, so a cutover to
 * a new project is env-only: swap URL + keys, no code change.
 */

export function supabaseUrl(): string | undefined {
  const raw =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  return raw || undefined;
}

export function supabaseAnonKey(): string | undefined {
  const raw =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();
  return raw || undefined;
}

export function supabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;
}

export function supabaseDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL?.trim() || undefined;
}

export function supabaseIsConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}
