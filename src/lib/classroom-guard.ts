import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { userIsCommunityAdmin } from "@/lib/auth/ownership";
import {
  allowClassAction,
  classActionError,
  parseClassPlan,
  resolveClassroomTrade,
  type ClassAction,
  type ClassPlan,
  type ClassroomTrade,
} from "@/lib/classroom";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export async function loadClassroomTrade(
  supabase: SupabaseClient,
  portfolioId: string
): Promise<{
  communityId: string;
  trade: ClassroomTrade;
  plan: ClassPlan;
} | null> {
  const { data: sheet } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("classroom_community_id")
    .eq("id", portfolioId)
    .maybeSingle();
  const communityId = (sheet as { classroom_community_id?: string | null } | null)
    ?.classroom_community_id;
  if (!communityId) return null;

  const { data: community } = await supabase
    .from(PORTFELL_TABLES.communities)
    .select("class_plan, house_note")
    .eq("id", communityId)
    .maybeSingle();
  const plan = parseClassPlan(
    (community as { class_plan?: unknown } | null)?.class_plan
  );
  const trade = resolveClassroomTrade(
    plan,
    new Date(),
    (community as { house_note?: string | null } | null)?.house_note
  );
  return { communityId, trade, plan };
}

/** Null if the write is allowed. 403 response if the class is closed for it. */
export async function denyClassroomWrite(
  supabase: SupabaseClient,
  opts: { portfolioId: string; userId: string; action: ClassAction | ClassAction[] }
): Promise<NextResponse | null> {
  const loaded = await loadClassroomTrade(supabase, opts.portfolioId);
  if (!loaded) return null;
  if (await userIsCommunityAdmin(opts.userId, loaded.communityId)) return null;
  const actions = Array.isArray(opts.action) ? opts.action : [opts.action];
  for (const action of actions) {
    if (!allowClassAction(loaded.trade, action)) {
      return NextResponse.json(
        { error: classActionError(loaded.trade) },
        { status: 403 }
      );
    }
  }
  return null;
}
