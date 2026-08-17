import {
  userIsCommunityAdmin,
  userIsCommunityMember,
} from "@/lib/auth/ownership";
import { provisionClassroomSheet } from "@/lib/classroom";
import {
  parseSharePortfolioIds,
  shareOwnedSheetsIntoCommunity,
} from "@/lib/community-share";
import { loadPaperClassGate, PAPER_CLASS_ONLY_MESSAGE } from "@/lib/paper-class-server";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Request to join a PUBLIC community — never auto-joins; an admin has to
 * approve. Re-requesting after a rejection resets the same row to pending
 * rather than erroring on the unique constraint. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { data: community } = await supabase
    .from(PORTFELL_TABLES.communities)
    .select("id, visibility")
    .eq("id", id)
    .maybeSingle();
  if (!community) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if ((community as { visibility?: string }).visibility !== "public") {
    return NextResponse.json(
      { error: "This community is invite-only" },
      { status: 403 }
    );
  }

  const gate = await loadPaperClassGate(supabase, auth.user.id);
  if (gate.only) {
    return NextResponse.json(
      { error: PAPER_CLASS_ONLY_MESSAGE },
      { status: 403 }
    );
  }

  if (await userIsCommunityMember(auth.user.id, id)) {
    return NextResponse.json({ error: "Already a member" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    portfolioIds?: unknown;
  };
  const shareIds = parseSharePortfolioIds(body.portfolioIds);

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.communityJoinRequests)
    .upsert(
      {
        community_id: id,
        user_id: auth.user.id,
        status: "pending",
        requested_at: new Date().toISOString(),
        decided_at: null,
        decided_by: null,
        share_portfolio_ids: shareIds,
      },
      { onConflict: "community_id,user_id" }
    )
    .select("id, status, requested_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ request: data });
}

/** Cancel your own pending request. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { error } = await supabase
    .from(PORTFELL_TABLES.communityJoinRequests)
    .delete()
    .eq("community_id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Admin: approve or reject a pending request. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  if (!(await userIsCommunityAdmin(auth.user.id, id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    userId?: string;
    decision?: "approve" | "reject";
  };
  const targetUserId = String(body.userId ?? "");
  if (!targetUserId || (body.decision !== "approve" && body.decision !== "reject")) {
    return NextResponse.json({ error: "userId and decision required" }, { status: 400 });
  }

  const { data: request } = await supabase
    .from(PORTFELL_TABLES.communityJoinRequests)
    .select("id, status, share_portfolio_ids")
    .eq("community_id", id)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!request || (request as { status?: string }).status !== "pending") {
    return NextResponse.json({ error: "No pending request" }, { status: 404 });
  }

  if (body.decision === "approve") {
    const { error: memberErr } = await supabase
      .from(PORTFELL_TABLES.communityMembers)
      .insert({ community_id: id, user_id: targetUserId, role: "member" });
    if (memberErr) {
      return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }
    await provisionClassroomSheet(supabase, {
      communityId: id,
      userId: targetUserId,
    });
    const picked = (request as { share_portfolio_ids?: string[] | null })
      .share_portfolio_ids;
    await shareOwnedSheetsIntoCommunity(supabase, {
      communityId: id,
      userId: targetUserId,
      portfolioIds: picked ?? null,
    });
  }

  const { error } = await supabase
    .from(PORTFELL_TABLES.communityJoinRequests)
    .update({
      status: body.decision === "approve" ? "approved" : "rejected",
      decided_at: new Date().toISOString(),
      decided_by: auth.user.id,
    })
    .eq("community_id", id)
    .eq("user_id", targetUserId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
