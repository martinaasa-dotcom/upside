import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import type { AppSupabaseClient } from "@/lib/supabase/client-types";
import type { Database } from "@/lib/supabase/database.types";
import { NextResponse } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { supabaseFetch } from "@/lib/supabase/http";

function attachCookies(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  response?: NextResponse
): AppSupabaseClient | null {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return null;

  return createServerClient<Database>(url, key, {
    global: { fetch: supabaseFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
            response?.cookies.set(name, value, options);
          });
        } catch {
          cookiesToSet.forEach(({ name, value, options }) => {
            response?.cookies.set(name, value, options);
          });
        }
      },
    },
  });
}

/** Cookie-session Supabase client (RLS as the signed-in user). */
export async function createSupabaseServerAuth(): Promise<AppSupabaseClient | null> {
  return attachCookies(await cookies());
}

/** Same client, but session cookies are copied onto a redirect response. */
export async function createSupabaseAuthForResponse(
  response: NextResponse
): Promise<AppSupabaseClient | null> {
  return attachCookies(await cookies(), response);
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
