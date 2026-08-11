import {
  getSupabaseDataClient,
  getSupabaseServer,
} from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextResponse } from "next/server";

async function db() {
  return (await getSupabaseDataClient()) ?? getSupabaseServer();
}

/** True when user is listed in portfell_portfolio_owners for this sheet. */
export async function userOwnsPortfolio(
  userId: string,
  portfolioId: string
): Promise<boolean> {
  const supabase = await db();
  if (!supabase) return false;
  const { data } = await supabase
    .from(PORTFELL_TABLES.portfolioOwners)
    .select("portfolio_id")
    .eq("portfolio_id", portfolioId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/** Portfolio ids the user co-owns (My book). */
export async function listOwnedPortfolioIds(
  userId: string
): Promise<string[]> {
  const supabase = await db();
  if (!supabase) return [];
  const { data } = await supabase
    .from(PORTFELL_TABLES.portfolioOwners)
    .select("portfolio_id")
    .eq("user_id", userId);
  return ((data ?? []) as { portfolio_id: string }[]).map((r) => r.portfolio_id);
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

/**
 * Add a co-owner by email. Caller must already be a co-owner (or use service role).
 * Creates a profile stub only if the target has already signed in (has a profile).
 */
export async function addCoOwnerToPortfolio(
  portfolioId: string,
  targetUserEmail: string
): Promise<{ ok: true; userId: string } | { error: string; status: number }> {
  const email = targetUserEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: "Valid email required", status: 400 };
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return { error: "Supabase not configured", status: 400 };
  }

  const { data: profile } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("id, email")
    .ilike("email", email)
    .maybeSingle();

  if (!profile?.id) {
    return {
      error:
        "No Upside profile for that email yet — they must sign in with Google first",
      status: 404,
    };
  }

  const userId = (profile as { id: string }).id;

  const { error } = await supabase.from(PORTFELL_TABLES.portfolioOwners).upsert(
    {
      portfolio_id: portfolioId,
      user_id: userId,
    },
    { onConflict: "portfolio_id,user_id" }
  );

  if (error) {
    return { error: error.message, status: 500 };
  }

  return { ok: true, userId };
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
