import { userIsCommunityMember } from "@/lib/auth/ownership";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Full community book: all members' portfolios + holdings (read-only). */
export async function GET(req: NextRequest, ctx: Ctx) {
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

  const ownerFilter = req.nextUrl.searchParams.get("ownerId");

  const { data: members } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("user_id")
    .eq("community_id", id);

  let userIds = ((members ?? []) as { user_id: string }[]).map((m) => m.user_id);
  if (ownerFilter) {
    if (!userIds.includes(ownerFilter)) {
      return NextResponse.json({ error: "Owner not in community" }, { status: 403 });
    }
    userIds = [ownerFilter];
  }

  if (!userIds.length) {
    return NextResponse.json({
      portfolios: [],
      holdings: [],
      profiles: [],
    });
  }

  const [{ data: profiles }, { data: portfolios }] = await Promise.all([
    supabase
      .from(PORTFELL_TABLES.profiles)
      .select("id, email, display_name, avatar_url")
      .in("id", userIds),
    supabase
      .from(PORTFELL_TABLES.portfolios)
      .select(
        "id, name, slug, sort_order, cash_balance, owner_id, created_at, updated_at"
      )
      .in("owner_id", userIds)
      .order("sort_order"),
  ]);

  const portfolioIds = (portfolios ?? []).map((p) => (p as { id: string }).id);
  let holdings: unknown[] = [];
  if (portfolioIds.length) {
    const { data: h } = await supabase
      .from(PORTFELL_TABLES.holdings)
      .select("*")
      .in("portfolio_id", portfolioIds)
      .order("sort_order");
    holdings = h ?? [];
  }

  return NextResponse.json({
    readOnly: true,
    profiles: profiles ?? [],
    portfolios: portfolios ?? [],
    holdings,
  });
}
