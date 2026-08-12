import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Self-service account deletion. Calls the security-definer RPC (self-scoped
 * to auth.uid() at the DB layer) which deletes sheets this user solely owns,
 * steps them off shared sheets, and removes their profile/lab
 * state/community rows via cascade.
 *
 * Cannot delete the actual auth.users row — that needs the service-role
 * admin API, which this project doesn't run with in production. The client
 * signs the session out immediately after; if they sign back in with the
 * same Google account they land as a brand-new user with none of this data.
 */
export async function POST() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc("portfell_delete_my_account");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, summary: data });
}
