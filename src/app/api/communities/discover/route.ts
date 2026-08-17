import { loadPaperClassGate } from "@/lib/paper-class-server";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public communities the caller hasn't joined yet, for a "discover" list —
 * plus their own pending/rejected request state on each, if any. Private
 * communities never appear here; they stay invite-only. */
export async function GET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ communities: [] });
  }

  const gate = await loadPaperClassGate(supabase, auth.user.id);
  if (gate.only) {
    return NextResponse.json({ communities: [] });
  }

  const [{ data: memberships }, { data: publicCommunities }] = await Promise.all([
    supabase
      .from(PORTFELL_TABLES.communityMembers)
      .select("community_id")
      .eq("user_id", auth.user.id),
    supabase
      .from(PORTFELL_TABLES.communities)
      .select("id, name, house_note, created_at")
      .eq("visibility", "public")
      .order("name"),
  ]);

  const memberOf = new Set(
    ((memberships ?? []) as { community_id: string }[]).map(
      (m) => m.community_id
    )
  );
  const candidates = ((publicCommunities ?? []) as {
    id: string;
    name: string;
    house_note: string | null;
    created_at: string;
  }[]).filter((c) => !memberOf.has(c.id));

  if (candidates.length === 0) {
    return NextResponse.json({ communities: [] });
  }

  const [{ data: requests }, { data: memberCounts }] = await Promise.all([
    supabase
      .from(PORTFELL_TABLES.communityJoinRequests)
      .select("community_id, status")
      .eq("user_id", auth.user.id)
      .in("community_id", candidates.map((c) => c.id)),
    supabase
      .from(PORTFELL_TABLES.communityMembers)
      .select("community_id")
      .in("community_id", candidates.map((c) => c.id)),
  ]);

  const requestStatusByCommunity = new Map(
    ((requests ?? []) as { community_id: string; status: string }[]).map(
      (r) => [r.community_id, r.status]
    )
  );
  const memberCountByCommunity = new Map<string, number>();
  for (const row of (memberCounts ?? []) as { community_id: string }[]) {
    memberCountByCommunity.set(
      row.community_id,
      (memberCountByCommunity.get(row.community_id) ?? 0) + 1
    );
  }

  return NextResponse.json({
    communities: candidates.map((c) => ({
      id: c.id,
      name: c.name,
      houseNote: c.house_note,
      memberCount: memberCountByCommunity.get(c.id) ?? 0,
      requestStatus: requestStatusByCommunity.get(c.id) ?? null,
    })),
  });
}
