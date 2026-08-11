import {
  collapseMembersByAlias,
  expandPersonUserIds,
  loadAliasMap,
  type RawMember,
} from "@/lib/auth/identity";
import { userIsCommunityMember } from "@/lib/auth/ownership";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Full community book: members' sheets + community-pinned sheets (read-only). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  if (!(await userIsCommunityMember(auth.user.id, id))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const aliasMap = await loadAliasMap(supabase);
  const ownerFilter = req.nextUrl.searchParams.get("ownerId");
  const pendingKey = ownerFilter?.startsWith("pending:")
    ? ownerFilter.slice("pending:".length)
    : null;

  const [{ data: members }, { data: pinned }] = await Promise.all([
    supabase
      .from(PORTFELL_TABLES.communityMembers)
      .select("user_id, role, joined_at")
      .eq("community_id", id),
    supabase
      .from(PORTFELL_TABLES.communityPortfolios)
      .select("portfolio_id, label")
      .eq("community_id", id),
  ]);

  const memberIds = ((members ?? []) as { user_id: string }[]).map(
    (m) => m.user_id
  );

  const { data: profiles } = memberIds.length
    ? await supabase
        .from(PORTFELL_TABLES.profiles)
        .select("id, email, display_name, avatar_url, bio")
        .in("id", memberIds)
    : { data: [] };

  const profileById = new Map(
    ((profiles ?? []) as { id: string }[]).map((p) => [p.id, p])
  );

  const rawMembers: RawMember[] = (
    (members ?? []) as { user_id: string; role: string; joined_at: string }[]
  ).map((m) => ({
    ...m,
    profile: (profileById.get(m.user_id) as RawMember["profile"]) ?? null,
  }));

  const people = collapseMembersByAlias(rawMembers, auth.user.id, aliasMap);

  let userIds = memberIds;
  let pinnedOnlyIds: string[] | null = null;

  if (pendingKey) {
    userIds = [];
    const pinnedIds = ((pinned ?? []) as { portfolio_id: string }[]).map(
      (p) => p.portfolio_id
    );
    if (pinnedIds.length) {
      const { data: sheets } = await supabase
        .from(PORTFELL_TABLES.portfolios)
        .select("id, slug")
        .in("id", pinnedIds);
      pinnedOnlyIds = ((sheets ?? []) as { id: string; slug: string }[])
        .filter((s) => s.slug === pendingKey)
        .map((s) => s.id);
    } else {
      pinnedOnlyIds = [];
    }
  } else if (ownerFilter) {
    const expanded = expandPersonUserIds(ownerFilter, people);
    if (!expanded.some((uid) => memberIds.includes(uid))) {
      return NextResponse.json({ error: "Owner not in community" }, { status: 403 });
    }
    userIds = expanded;
  }

  const [{ data: ownership }] = await Promise.all([
    userIds.length
      ? supabase
          .from(PORTFELL_TABLES.portfolioOwners)
          .select("portfolio_id, user_id")
          .in("user_id", userIds)
      : Promise.resolve({ data: [] as { portfolio_id: string; user_id: string }[] }),
  ]);

  const pinnedIdsAll = ((pinned ?? []) as { portfolio_id: string }[]).map(
    (p) => p.portfolio_id
  );

  let portfolioIds: string[];
  if (pinnedOnlyIds) {
    portfolioIds = pinnedOnlyIds;
  } else if (ownerFilter) {
    portfolioIds = [
      ...new Set(
        ((ownership ?? []) as { portfolio_id: string }[]).map(
          (o) => o.portfolio_id
        )
      ),
    ];
  } else {
    portfolioIds = [
      ...new Set([
        ...((ownership ?? []) as { portfolio_id: string }[]).map(
          (o) => o.portfolio_id
        ),
        ...pinnedIdsAll,
      ]),
    ];
  }

  let portfolios: unknown[] = [];
  if (portfolioIds.length) {
    const { data: p } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .select(
        "id, name, slug, sort_order, cash_balance, owner_id, created_at, updated_at"
      )
      .in("id", portfolioIds)
      .order("sort_order");
    portfolios = p ?? [];
  }

  let holdings: unknown[] = [];
  if (portfolioIds.length) {
    const { data: h } = await supabase
      .from(PORTFELL_TABLES.holdings)
      .select("*")
      .in("portfolio_id", portfolioIds)
      .order("sort_order");
    holdings = h ?? [];
  }

  const userToPerson = new Map<string, string>();
  for (const person of people) {
    for (const uid of person.user_ids) {
      userToPerson.set(uid, person.person_id);
    }
  }

  const ownershipOut = (
    (ownership ?? []) as { portfolio_id: string; user_id: string }[]
  ).map((o) => ({
    portfolio_id: o.portfolio_id,
    user_id: userToPerson.get(o.user_id) ?? o.user_id,
  }));

  if (!ownerFilter) {
    for (const pid of pinnedIdsAll) {
      const sheet = (portfolios as { id: string; slug: string }[]).find(
        (p) => p.id === pid
      );
      if (!sheet) continue;
      const alreadyOwned = ownershipOut.some((o) => o.portfolio_id === pid);
      if (!alreadyOwned) {
        ownershipOut.push({
          portfolio_id: pid,
          user_id: `pending:${sheet.slug}`,
        });
      }
    }
  } else if (pendingKey && pinnedOnlyIds) {
    for (const pid of pinnedOnlyIds) {
      ownershipOut.push({
        portfolio_id: pid,
        user_id: `pending:${pendingKey}`,
      });
    }
  }

  return NextResponse.json({
    readOnly: true,
    profiles: profiles ?? [],
    portfolios,
    holdings,
    ownership: ownershipOut,
  });
}
