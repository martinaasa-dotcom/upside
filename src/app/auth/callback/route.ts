import { NextResponse } from "next/server";
import { ensureProfileAndClaims } from "@/lib/auth/ensure-profile";
import { createSupabaseServerAuth } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";
  const origin = url.origin;

  if (code) {
    const supabase = await createSupabaseServerAuth();
    if (supabase) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.user) {
        await ensureProfileAndClaims(data.user);
      }
    }
  }

  return NextResponse.redirect(new URL(next, origin));
}
