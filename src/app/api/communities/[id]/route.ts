import {
  userIsCommunityAdmin,
  userIsCommunityMember,
} from "@/lib/auth/ownership";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  if (!(await userIsCommunityMember(auth.user.id, id))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const [{ data: community }, { data: members }] = await Promise.all([
    supabase
      .from(PORTFELL_TABLES.communities)
      .select("id, name, created_by, created_at, updated_at")
      .eq("id", id)
      .single(),
    supabase
      .from(PORTFELL_TABLES.communityMembers)
      .select("user_id, role, joined_at")
      .eq("community_id", id),
  ]);

  if (!community) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userIds = ((members ?? []) as { user_id: string }[]).map(
    (m) => m.user_id
  );
  const { data: profiles } = userIds.length
    ? await supabase
        .from(PORTFELL_TABLES.profiles)
        .select("id, email, display_name, avatar_url")
        .in("id", userIds)
    : { data: [] };

  const profileById = new Map(
    ((profiles ?? []) as { id: string }[]).map((p) => [p.id, p])
  );

  const { data: portfolios } = userIds.length
    ? await supabase
        .from(PORTFELL_TABLES.portfolios)
        .select("id, name, slug, sort_order, cash_balance, owner_id")
        .in("owner_id", userIds)
        .order("sort_order")
    : { data: [] };

  const isAdmin = await userIsCommunityAdmin(auth.user.id, id);

  return NextResponse.json({
    community,
    isAdmin,
    members: ((members ?? []) as { user_id: string; role: string; joined_at: string }[]).map(
      (m) => ({
        ...m,
        profile: profileById.get(m.user_id) ?? null,
      })
    ),
    portfolios: portfolios ?? [],
  });
}
