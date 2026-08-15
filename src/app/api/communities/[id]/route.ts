import {
  collapseMembersByAlias,
  loadAliasMap,
  type PendingHousehold,
  type RawMember,
} from "@/lib/auth/identity";
import {
  userIsCommunityAdmin,
  userIsCommunityMember,
} from "@/lib/auth/ownership";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
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

  // None of these depend on each other, and isAdmin is only consumed much
  // further down, so fetching it here costs nothing extra instead of an
  // extra serial round-trip later.
  const [aliasMap, isAdmin, { data: community }, { data: members }, { data: pinned }] =
    await Promise.all([
      loadAliasMap(supabase),
      userIsCommunityAdmin(auth.user.id, id),
      supabase
        .from(PORTFELL_TABLES.communities)
        .select("id, name, visibility, kind, starting_cash, house_note, created_by, created_at, updated_at")
        .eq("id", id)
        .single(),
      supabase
        .from(PORTFELL_TABLES.communityMembers)
        .select("user_id, role, joined_at")
        .eq("community_id", id),
      supabase
        .from(PORTFELL_TABLES.communityPortfolios)
        .select("portfolio_id, label")
        .eq("community_id", id),
    ]);

  if (!community) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userIds = ((members ?? []) as { user_id: string }[]).map(
    (m) => m.user_id
  );
  const { data: profiles } = userIds.length
    ? await supabase
        .from(PORTFELL_TABLES.profiles)
        .select("id, email, display_name, avatar_url, bio")
        .in("id", userIds)
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

  const people = collapseMembersByAlias(
    rawMembers,
    auth.user.id,
    aliasMap
  );

  const pinnedRows = (pinned ?? []) as {
    portfolio_id: string;
    label: string | null;
  }[];
  const pinnedIds = pinnedRows.map((p) => p.portfolio_id);

  const { data: ownership } = pinnedIds.length
    ? await supabase
        .from(PORTFELL_TABLES.portfolioOwners)
        .select("portfolio_id, user_id")
        .in("portfolio_id", pinnedIds)
    : { data: [] };

  const ownedIds = [
    ...new Set(
      ((ownership ?? []) as { portfolio_id: string; user_id: string }[])
        .filter((o) => userIds.includes(o.user_id))
        .map((o) => o.portfolio_id)
    ),
  ];
  const portfolioIds = [...new Set(pinnedIds)];

  const { data: portfolios } = portfolioIds.length
    ? await supabase
        .from(PORTFELL_TABLES.portfolios)
        .select("id, name, slug, sort_order, cash_balance, owner_id, classroom_community_id")
        .in("id", portfolioIds)
        .order("sort_order")
    : { data: [] };

  // Pending households: pinned sheets not yet owned by any signed-in member.
  const ownedSet = new Set(ownedIds);
  const memberUserIds = new Set(userIds);
  const portfolioRows = (portfolios ?? []) as {
    id: string;
    name: string;
    slug: string;
    owner_id?: string | null;
  }[];

  const isOwnedByMember = (portfolioId: string) => {
    if (ownedSet.has(portfolioId)) return true;
    const row = portfolioRows.find((p) => p.id === portfolioId);
    return Boolean(row?.owner_id && memberUserIds.has(row.owner_id));
  };

  const pendingPortfolioIds = pinnedIds.filter((pid) => !isOwnedByMember(pid));
  let pending_members: PendingHousehold[] = [];

  if (pendingPortfolioIds.length) {
    const pendingPortfolios = (
      (portfolios ?? []) as { id: string; name: string; slug: string }[]
    ).filter((p) => pendingPortfolioIds.includes(p.id));

    const slugs = pendingPortfolios.map((p) => p.slug);
    const { data: claims } = slugs.length
      ? await supabase
          .from(PORTFELL_TABLES.seedClaims)
          .select("email, portfolio_slug")
          .in("portfolio_slug", slugs)
      : { data: [] };

    const emailsBySlug = new Map<string, string[]>(
      Object.entries({
        karud: ["rasmusmarjapuu@gmail.com", "karukaroliine99@gmail.com"],
        lap: ["liinaanette@gmail.com"],
      })
    );
    for (const c of (claims ?? []) as {
      email: string;
      portfolio_slug: string;
    }[]) {
      const list = emailsBySlug.get(c.portfolio_slug) ?? [];
      const em = c.email.toLowerCase();
      if (!list.includes(em)) list.push(em);
      emailsBySlug.set(c.portfolio_slug, list);
    }

    pending_members = pendingPortfolios.map((p) => {
      const pin = pinnedRows.find((r) => r.portfolio_id === p.id);
      return {
        key: p.slug,
        label: pin?.label || p.name,
        portfolio_ids: [p.id],
        emails: emailsBySlug.get(p.slug) ?? [],
      };
    });
  }

  let join_requests: {
    id: string;
    user_id: string;
    message: string | null;
    requested_at: string;
    profile: { display_name: string | null; email: string | null; avatar_url: string | null } | null;
  }[] = [];
  if (isAdmin) {
    const { data: pendingRequests } = await supabase
      .from(PORTFELL_TABLES.communityJoinRequests)
      .select("id, user_id, message, requested_at")
      .eq("community_id", id)
      .eq("status", "pending")
      .order("requested_at", { ascending: true });
    const reqUserIds = ((pendingRequests ?? []) as { user_id: string }[]).map(
      (r) => r.user_id
    );
    const { data: reqProfiles } = reqUserIds.length
      ? await supabase
          .from(PORTFELL_TABLES.profiles)
          .select("id, email, display_name, avatar_url")
          .in("id", reqUserIds)
      : { data: [] };
    const reqProfileById = new Map(
      (
        (reqProfiles ?? []) as {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
        }[]
      ).map((p) => [p.id, p])
    );
    join_requests = (
      (pendingRequests ?? []) as {
        id: string;
        user_id: string;
        message: string | null;
        requested_at: string;
      }[]
    ).map((r) => ({
      ...r,
      profile: reqProfileById.get(r.user_id) ?? null,
    }));
  }

  // Remap ownership to person_id for client attribution
  const userToPerson = new Map<string, string>();
  for (const person of people) {
    for (const uid of person.user_ids) {
      userToPerson.set(uid, person.person_id);
    }
  }

  const ownershipForClient = (
    (ownership ?? []) as { portfolio_id: string; user_id: string }[]
  ).map((o) => ({
    portfolio_id: o.portfolio_id,
    user_id: userToPerson.get(o.user_id) ?? o.user_id,
    raw_user_id: o.user_id,
  }));

  const attributedPortfolioIds = new Set(
    ownershipForClient.map((o) => o.portfolio_id)
  );
  for (const p of portfolioRows) {
    if (
      p.owner_id &&
      memberUserIds.has(p.owner_id) &&
      !attributedPortfolioIds.has(p.id)
    ) {
      ownershipForClient.push({
        portfolio_id: p.id,
        user_id: userToPerson.get(p.owner_id) ?? p.owner_id,
        raw_user_id: p.owner_id,
      });
      attributedPortfolioIds.add(p.id);
    }
  }

  // Synthetic ownership for pending pinned sheets (household key as user_id)
  for (const pending of pending_members) {
    for (const pid of pending.portfolio_ids) {
      ownershipForClient.push({
        portfolio_id: pid,
        user_id: `pending:${pending.key}`,
        raw_user_id: `pending:${pending.key}`,
      });
    }
  }

  return NextResponse.json({
    community,
    isAdmin,
    join_requests,
    members: people.map((p) => ({
      user_id: p.person_id,
      user_ids: p.user_ids,
      emails: p.emails,
      role: p.role,
      joined_at: p.joined_at,
      profile: p.profile,
      is_you: p.is_you,
    })),
    pending_members,
    portfolios: portfolios ?? [],
    ownership: ownershipForClient,
  });
}

/** Admin: rename the community and/or flip public/private visibility. */
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
    name?: string;
    visibility?: string;
    houseNote?: string;
  };

  const patch: Record<string, string> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 80);
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    patch.name = name;
  }
  if (body.visibility !== undefined) {
    if (body.visibility !== "public" && body.visibility !== "private") {
      return NextResponse.json({ error: "invalid visibility" }, { status: 400 });
    }
    const { data: current } = await supabase
      .from(PORTFELL_TABLES.communities)
      .select("kind")
      .eq("id", id)
      .maybeSingle();
    if (
      body.visibility === "public" &&
      (current as { kind?: string } | null)?.kind === "classroom"
    ) {
      return NextResponse.json(
        { error: "Classes stay invite-only" },
        { status: 400 }
      );
    }
    patch.visibility = body.visibility;
  }
  if (body.houseNote !== undefined) {
    patch.house_note = String(body.houseNote).trim().slice(0, 400);
  }
  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data: community, error } = await supabase
    .from(PORTFELL_TABLES.communities)
    .update(patch)
    .eq("id", id)
    .select("id, name, visibility, kind, starting_cash, house_note, created_by, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ community });
}

/** Admin: delete the community outright. Members lose shared read access;
 * everyone's own portfolios are untouched (only community_members and
 * community_portfolios rows cascade-delete). */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
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

  const { error } = await supabase
    .from(PORTFELL_TABLES.communities)
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
