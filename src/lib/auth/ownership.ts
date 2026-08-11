import {
  getSupabaseDataClient,
  getSupabaseServer,
} from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextResponse } from "next/server";

async function db() {
  return (await getSupabaseDataClient()) ?? getSupabaseServer();
}

/** True when portfolio.owner_id matches the signed-in user. */
export async function userOwnsPortfolio(
  userId: string,
  portfolioId: string
): Promise<boolean> {
  const supabase = await db();
  if (!supabase) return false;
  const { data } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("owner_id")
    .eq("id", portfolioId)
    .maybeSingle();
  return (data as { owner_id?: string | null } | null)?.owner_id === userId;
}

export async function requirePortfolioOwner(
  userId: string,
  portfolioId: string | null | undefined
): Promise<NextResponse | null> {
  if (!portfolioId) {
    return NextResponse.json(
      { error: "portfolio_id required" },
      { status: 400 }
    );
  }
  if (!(await userOwnsPortfolio(userId, portfolioId))) {
    return NextResponse.json(
      { error: "You can only edit portfolios you own" },
      { status: 403 }
    );
  }
  return null;
}

/** Member of community can read any member's book. */
export async function userCanReadOwnerBook(
  viewerId: string,
  ownerId: string
): Promise<boolean> {
  if (viewerId === ownerId) return true;
  const supabase = await db();
  if (!supabase) return false;
  const { data: myCommunities } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("community_id")
    .eq("user_id", viewerId);
  const ids = ((myCommunities ?? []) as { community_id: string }[]).map(
    (r) => r.community_id
  );
  if (!ids.length) return false;
  const { data: peer } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("user_id")
    .eq("user_id", ownerId)
    .in("community_id", ids)
    .limit(1)
    .maybeSingle();
  return Boolean(peer);
}

export async function userIsCommunityAdmin(
  userId: string,
  communityId: string
): Promise<boolean> {
  const supabase = await db();
  if (!supabase) return false;
  const { data } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { role?: string } | null)?.role === "admin";
}

export async function userIsCommunityMember(
  userId: string,
  communityId: string
): Promise<boolean> {
  const supabase = await db();
  if (!supabase) return false;
  const { data } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("user_id")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}
