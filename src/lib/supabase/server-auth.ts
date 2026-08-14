import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/** Cookie-session Supabase client (RLS as the signed-in user). */
export async function createSupabaseServerAuth(): Promise<SupabaseClient | null> {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return null;

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — middleware/proxy refreshes sessions.
        }
      },
    },
  });
}

export async function getAuthUser(): Promise<User | null> {
  const supabase = await createSupabaseServerAuth();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** 401 unless a Google (or other) session is present. */
export async function requireAuthUser(): Promise<
  { user: User } | { error: NextResponse }
> {
  const user = await getAuthUser();
  if (!user) {
    return {
      error: NextResponse.json(
        { error: "Sign in required" },
        { status: 401 }
      ),
    };
  }
  return { user };
}
