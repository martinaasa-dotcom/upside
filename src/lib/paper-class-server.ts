import type { SupabaseClient } from "@supabase/supabase-js";
import { listOwnedPortfolioIds } from "@/lib/auth/ownership";
import {
  isClassroomKind,
  isPaperClassOnly,
  paperClassIds,
} from "@/lib/classroom";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export type PaperClassGate = {
  only: boolean;
  classIds: string[];
};

export async function loadPaperClassGate(
  supabase: SupabaseClient,
  userId: string
): Promise<PaperClassGate> {
  const ownedIds = await listOwnedPortfolioIds(userId);
  let portfolios: { classroom_community_id?: string | null }[] = [];
  if (ownedIds.length) {
    const { data } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .select("classroom_community_id")
      .in("id", ownedIds);
    portfolios = (data ?? []) as { classroom_community_id?: string | null }[];
  }

  const { data: memberships } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("community_id")
    .eq("user_id", userId);
  const memberIds = (
    (memberships ?? []) as { community_id: string }[]
  ).map((m) => m.community_id);

  let communities: { id: string; kind?: string | null }[] = [];
  if (memberIds.length) {
    const { data } = await supabase
      .from(PORTFELL_TABLES.communities)
      .select("id, kind")
      .in("id", memberIds);
    communities = (data ?? []) as { id: string; kind?: string | null }[];
  }

  return {
    only: isPaperClassOnly(portfolios, communities),
    classIds: paperClassIds(portfolios, communities),
  };
}

export const PAPER_CLASS_ONLY_MESSAGE =
  "This account stays in the paper class.";
