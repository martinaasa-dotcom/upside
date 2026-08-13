import {
  collapseMembersByAlias,
  expandPersonUserIds,
  loadAliasMap,
  type RawMember,
} from "@/lib/auth/identity";
import { userIsCommunityAdmin } from "@/lib/auth/ownership";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; userId: string }> };

async function resolveTargetUserIds(
  communityId: string,
  personOrUserId: string,
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseDataClient>>>
): Promise<string[]> {
  const aliasMap = await loadAliasMap(supabase);
  const { data: members } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("user_id, role, joined_at")
    .eq("community_id", communityId);
  const userIds = ((members ?? []) as { user_id: string }[]).map(
    (m) => m.user_id
  );
  const { data: profiles } = userIds.length
    ? await supabase
        .from(PORTFELL_TABLES.profiles)
        .select("id, email, display_name, avatar_url, bio")
        .in("id", userIds)
    : { data: [] };
  const profileById = new Map(
    ((profiles ?? []) as { id: string }[]).map((p) => [p.id, p])
  );
  const raw: RawMember[] = (
    (members ?? []) as { user_id: string; role: string; joined_at: string }[]
  ).map((m) => ({
    ...m,
    profile: (profileById.get(m.user_id) as RawMember["profile"]) ?? null,
  }));
  const people = collapseMembersByAlias(raw, null, aliasMap);
  return expandPersonUserIds(personOrUserId, people);
}

/** Admin: remove member or change role (applies to all linked alias accounts). */
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

  const targetIds = await resolveTargetUserIds(id, userId, supabase);
  if (!targetIds.length) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
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
    const remainingAdmins = adminIds.filter((a) => !targetIds.includes(a));
    if (remainingAdmins.length === 0) {
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
    .in("user_id", targetIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * Admin removes a member, or a member removes themselves.
 *
 * Self-removal matters now that public communities let people request in:
 * without it, anyone who joined one was stuck until an admin got around to
 * evicting them. The last-admin guard below still applies either way, so
 * nobody can leave a community with no admin behind.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id, userId } = await ctx.params;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const targetIds = await resolveTargetUserIds(id, userId, supabase);
  if (!targetIds.length) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Resolve first: "self" means any account linked to the caller's person,
  // so leaving with a household alias takes both logins out together.
  const isSelf = targetIds.includes(auth.user.id);
  if (!isSelf && !(await userIsCommunityAdmin(auth.user.id, id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { data: admins } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("user_id")
    .eq("community_id", id)
    .eq("role", "admin");
  const adminIds = ((admins ?? []) as { user_id: string }[]).map(
    (a) => a.user_id
  );
  const removingAdmin = targetIds.some((t) => adminIds.includes(t));
  if (removingAdmin) {
    const remainingAdmins = adminIds.filter((a) => !targetIds.includes(a));
    if (remainingAdmins.length === 0) {
      return NextResponse.json(
        {
          error: isSelf
            ? "You're the only admin. Promote someone else first, or delete the community."
            : "Keep at least one admin",
        },
        { status: 400 }
      );
    }
  }

  const { error } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .delete()
    .eq("community_id", id)
    .in("user_id", targetIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
