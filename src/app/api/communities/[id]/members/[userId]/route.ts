import { userIsCommunityAdmin } from "@/lib/auth/ownership";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; userId: string }> };

/** Admin: remove member or change role. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id, userId } = await ctx.params;
  if (!(await userIsCommunityAdmin(auth.user.id, id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    role?: "admin" | "member";
  };

  if (body.role !== "admin" && body.role !== "member") {
    return NextResponse.json({ error: "role required" }, { status: 400 });
  }

  if (body.role === "member") {
    const { data: admins } = await supabase
      .from(PORTFELL_TABLES.communityMembers)
      .select("user_id")
      .eq("community_id", id)
      .eq("role", "admin");
    const adminIds = ((admins ?? []) as { user_id: string }[]).map(
      (a) => a.user_id
    );
    if (adminIds.length <= 1 && adminIds.includes(userId)) {
      return NextResponse.json(
        { error: "Keep at least one admin" },
        { status: 400 }
      );
    }
  }

  const { error } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .update({ role: body.role })
    .eq("community_id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id, userId } = await ctx.params;
  if (!(await userIsCommunityAdmin(auth.user.id, id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { data: target } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("role")
    .eq("community_id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if ((target as { role?: string } | null)?.role === "admin") {
    const { data: admins } = await supabase
      .from(PORTFELL_TABLES.communityMembers)
      .select("user_id")
      .eq("community_id", id)
      .eq("role", "admin");
    if (((admins ?? []) as unknown[]).length <= 1) {
      return NextResponse.json(
        { error: "Keep at least one admin" },
        { status: 400 }
      );
    }
  }

  const { error } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .delete()
    .eq("community_id", id)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
