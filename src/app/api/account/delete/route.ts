import { createSupabaseServerAuth, requireAuthUser } from "@/lib/supabase/server-auth";
import {
  getSupabaseServer,
  supabaseUsesServiceRole,
} from "@/lib/supabase/server";
import { revokeAllUserSessions } from "@/lib/auth/revoke-sessions";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

/**
 * Self-service account deletion.
 *
 * 1. Revoke every refresh token so other devices cannot mint a new JWT.
 * 2. Calls the security-definer RPC (self-scoped to auth.uid() at the DB
 *    layer) which deletes sheets this user solely owns, steps them off
 *    shared sheets, and removes their profile/lab state/community rows via
 *    cascade. Must run before step 3 — it needs the profile row to still
 *    exist to decide sole-owned vs. shared sheets; auth.users cascading
 *    straight to portfell_profiles would skip that logic and orphan
 *    sole-owned sheets instead of actually deleting them. A BEFORE DELETE
 *    trigger on profiles now also runs the same purge, so a dashboard
 *    deleteUser still scrubs snapshots, cash events, and error-log PII.
 * 3. If SUPABASE_SERVICE_ROLE_KEY is configured, also deletes the
 *    auth.users row itself via the admin API — the sign-in credential is
 *    gone, not just the app data. Without a service-role key this step is
 *    skipped (graceful, not fatal): app data is already fully wiped, the
 *    client signs the session out, and signing back in with the same
 *    Google account just creates a brand-new user with none of this data.
 */
async function handlePOST() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await createSupabaseServerAuth();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const jwt = sessionData.session?.access_token;
  if (jwt && supabaseUsesServiceRole()) {
    const admin = getSupabaseServer();
    if (admin) {
      await admin.auth.admin.signOut(jwt, "global");
    }
  }
  await revokeAllUserSessions(auth.user.id);

  const { data, error } = await supabase.rpc("portfell_delete_my_account");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let authDeleted = false;
  let authDeleteError: string | null = null;
  if (supabaseUsesServiceRole()) {
    const admin = getSupabaseServer();
    const { error: adminError } = admin
      ? await admin.auth.admin.deleteUser(auth.user.id)
      : { error: { message: "Service-role client unavailable" } };
    if (adminError) {
      authDeleteError = adminError.message;
    } else {
      authDeleted = true;
    }
  }

  return NextResponse.json({
    ok: true,
    summary: data,
    authDeleted,
    ...(authDeleteError ? { authDeleteError } : {}),
  });
}

export const POST = observeRoute(handlePOST, "/api/account/delete");
