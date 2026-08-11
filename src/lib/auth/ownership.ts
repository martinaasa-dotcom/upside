import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextResponse } from "next/server";

async function db() {
  return getSupabaseDataClient();
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
 * Add a co-owner by email. Caller must already be a co-owner.
 * Creates a profile stub only if the target has already signed in (has a profile).
 *
 * The email->profile lookup goes through a security-definer RPC: the caller
 * has no existing relationship with the target (that's the whole point of
 * adding them), so ownership/community-based RLS can never authorize a
 * regular cross-user profile lookup. The actual ownership insert uses the
 * caller's own session — that one *is* authorized normally, since the caller
 * is already verified as a co-owner before this runs.
 */
export async function addCoOwnerToPortfolio(
  portfolioId: string,
  targetUserEmail: string
): Promise<{ ok: true; userId: string } | { error: string; status: number }> {
  const email = targetUserEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: "Valid email required", status: 400 };
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return { error: "Supabase not configured", status: 400 };
  }

  const { data: userId, error: lookupError } = await supabase.rpc(
    "portfell_lookup_profile_id_by_email",
    { p_email: email }
  );

  if (lookupError) {
    return { error: lookupError.message, status: 500 };
  }
  if (!userId) {
    return {
      error:
        "No Upside profile for that email yet — they must sign in with Google first",
      status: 404,
    };
  }

  const { error } = await supabase.from(PORTFELL_TABLES.portfolioOwners).upsert(
    {
      portfolio_id: portfolioId,
      user_id: userId as string,
    },
    { onConflict: "portfolio_id,user_id" }
  );

  if (error) {
    return { error: error.message, status: 500 };
  }

  return { ok: true, userId: userId as string };
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
