import { userIsCommunityAdmin } from "@/lib/auth/ownership";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; inviteId: string }> };

/** Admin: retire an invite so new people cannot join with it. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id, inviteId } = await ctx.params;
  if (!(await userIsCommunityAdmin(auth.user.id, id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { revoked?: boolean };
  if (body.revoked !== true) {
    return NextResponse.json({ error: "revoked required" }, { status: 400 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.communityInvites)
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("community_id", id)
    .is("revoked_at", null)
    .select("id, revoked_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    const { data: existing } = await supabase
      .from(PORTFELL_TABLES.communityInvites)
      .select("id, revoked_at")
      .eq("id", inviteId)
      .eq("community_id", id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
  }

  return NextResponse.json({ ok: true });
}
