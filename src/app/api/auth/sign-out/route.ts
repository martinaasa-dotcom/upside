import { createSupabaseServerAuth, requireAuthUser } from "@/lib/supabase/server-auth";
import { revokeAllUserSessions } from "@/lib/auth/revoke-sessions";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

/** Revoke refresh tokens for this user on every device, then clear cookies. */
async function handlePOST() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  await revokeAllUserSessions(auth.user.id);

  const supabase = await createSupabaseServerAuth();
  if (supabase) {
    await supabase.auth.signOut({ scope: "global" });
  }

  return NextResponse.json({ ok: true });
}

export const POST = observeRoute(handlePOST, "/api/auth/sign-out");
