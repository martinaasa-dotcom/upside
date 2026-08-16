import { isClassroomKind } from "@/lib/classroom";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import type { getSupabaseDataClient } from "@/lib/supabase/server";

type DataClient = NonNullable<Awaited<ReturnType<typeof getSupabaseDataClient>>>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseSharePortfolioIds(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = String(item ?? "").trim();
    if (!UUID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Pin someone's real portfolios into a circle. Never a class. Never a class sheet. */
export async function shareOwnedSheetsIntoCommunity(
  supabase: DataClient,
  opts: {
    communityId: string;
    userId: string;
    portfolioIds?: string[] | null;
  }
): Promise<number> {
  const { data: community } = await supabase
    .from(PORTFELL_TABLES.communities)
    .select("kind")
    .eq("id", opts.communityId)
    .maybeSingle();
  if (isClassroomKind((community as { kind?: string } | null)?.kind)) {
    return 0;
  }

  const { data: owned } = await supabase
    .from(PORTFELL_TABLES.portfolioOwners)
    .select("portfolio_id")
    .eq("user_id", opts.userId);
  let ids = ((owned ?? []) as { portfolio_id: string }[]).map(
    (r) => r.portfolio_id
  );
  if (opts.portfolioIds) {
    const allow = new Set(opts.portfolioIds);
    ids = ids.filter((id) => allow.has(id));
  }
  if (!ids.length) return 0;

  const { data: sheets } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("id, name, classroom_community_id")
    .in("id", ids);
  const shareable = (
    (sheets ?? []) as {
      id: string;
      name: string;
      classroom_community_id?: string | null;
    }[]
  ).filter((p) => !p.classroom_community_id);
  if (!shareable.length) return 0;

  const { error } = await supabase.from(PORTFELL_TABLES.communityPortfolios).upsert(
    shareable.map((p) => ({
      community_id: opts.communityId,
      portfolio_id: p.id,
      label: p.name,
    })),
    { onConflict: "community_id,portfolio_id", ignoreDuplicates: true }
  );
  if (error) {
    console.error("[community-share]", error.message);
    return 0;
  }
  return shareable.length;
}

/** A new real portfolio shows up in every circle the owner is already in. */
export async function shareNewSheetIntoMemberCircles(
  supabase: DataClient,
  opts: { userId: string; portfolioId: string; name: string }
): Promise<void> {
  const { data: sheet } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("classroom_community_id")
    .eq("id", opts.portfolioId)
    .maybeSingle();
  if (
    (sheet as { classroom_community_id?: string | null } | null)
      ?.classroom_community_id
  ) {
    return;
  }

  const { data: memberships } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("community_id")
    .eq("user_id", opts.userId);
  const communityIds = ((memberships ?? []) as { community_id: string }[]).map(
    (m) => m.community_id
  );
  if (!communityIds.length) return;

  const { data: communities } = await supabase
    .from(PORTFELL_TABLES.communities)
    .select("id, kind")
    .in("id", communityIds);
  const circleIds = (
    (communities ?? []) as { id: string; kind?: string }[]
  )
    .filter((c) => !isClassroomKind(c.kind))
    .map((c) => c.id);
  if (!circleIds.length) return;

  const { error } = await supabase.from(PORTFELL_TABLES.communityPortfolios).upsert(
    circleIds.map((community_id) => ({
      community_id,
      portfolio_id: opts.portfolioId,
      label: opts.name,
    })),
    { onConflict: "community_id,portfolio_id", ignoreDuplicates: true }
  );
  if (error) {
    console.error("[community-share]", error.message);
  }
}
