import { ensureProfileAndClaims } from "@/lib/auth/ensure-profile";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  await ensureProfileAndClaims(auth.user);

  const admin = getSupabaseServer();
  let profile = null;
  if (admin) {
    const { data } = await admin
      .from(PORTFELL_TABLES.profiles)
      .select("id, email, display_name, avatar_url")
      .eq("id", auth.user.id)
      .maybeSingle();
    profile = data;
  }

  return NextResponse.json({
    user: {
      id: auth.user.id,
      email: auth.user.email ?? null,
    },
    profile,
  });
}
