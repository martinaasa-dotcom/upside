import { getSupabaseServer } from "@/lib/supabase/server";
import {
  PORTFELL_TABLES,
  UPSIDE_CIRCLE_ID,
} from "@/lib/supabase/tables";
import type { User } from "@supabase/supabase-js";

/** Extra seed emails for Karud/Lap (Martin is in DB seed_claims). */
function envSeedSlugs(email: string): string[] {
  const e = email.toLowerCase();
  const out: string[] = [];
  const karud = process.env.UPSIDE_SEED_KARUD_EMAIL?.trim().toLowerCase();
  const lap = process.env.UPSIDE_SEED_LAP_EMAIL?.trim().toLowerCase();
  if (karud && karud === e) out.push("karud");
  if (lap && lap === e) out.push("lap");
  return out;
}

/**
 * Upsert profile, claim seed portfolios by email, ensure Upside Circle membership.
 * Safe to call on every auth callback / session bootstrap.
 */
export async function ensureProfileAndClaims(user: User): Promise<{
  claimedSlugs: string[];
}> {
  const admin = getSupabaseServer();
  if (!admin) return { claimedSlugs: [] };

  const email = (user.email ?? "").trim().toLowerCase();
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const displayName =
    (typeof meta?.full_name === "string" && meta.full_name) ||
    (typeof meta?.name === "string" && meta.name) ||
    email.split("@")[0] ||
    "Investor";
  const avatarUrl =
    typeof meta?.avatar_url === "string"
      ? meta.avatar_url
      : typeof meta?.picture === "string"
        ? meta.picture
        : null;

  await admin.from(PORTFELL_TABLES.profiles).upsert(
    {
      id: user.id,
      email: email || null,
      display_name: displayName,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  const claimedSlugs: string[] = [];
  if (email) {
    const { data: claims } = await admin
      .from(PORTFELL_TABLES.seedClaims)
      .select("portfolio_slug")
      .eq("email", email);

    const slugs = new Set<string>([
      ...((claims ?? []) as { portfolio_slug: string }[]).map(
        (c) => c.portfolio_slug
      ),
      ...envSeedSlugs(email),
    ]);

    for (const slug of slugs) {
      const { data: rows } = await admin
        .from(PORTFELL_TABLES.portfolios)
        .update({
          owner_id: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq("slug", slug)
        .is("owner_id", null)
        .select("slug");
      if (rows?.length) claimedSlugs.push(slug);

      // Also reclaim if already owned by this user (no-op) — and allow
      // reassignment when still unclaimed after partial runs.
      const { data: owned } = await admin
        .from(PORTFELL_TABLES.portfolios)
        .select("slug, owner_id")
        .eq("slug", slug)
        .maybeSingle();
      if (
        owned &&
        !(owned as { owner_id?: string | null }).owner_id
      ) {
        await admin
          .from(PORTFELL_TABLES.portfolios)
          .update({
            owner_id: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("slug", slug);
        if (!claimedSlugs.includes(slug)) claimedSlugs.push(slug);
      }
    }
  }

  // Seed personal lab row if missing
  const { data: lab } = await admin
    .from(PORTFELL_TABLES.labState)
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!lab) {
    await admin.from(PORTFELL_TABLES.labState).upsert(
      {
        id: user.id,
        owner_id: user.id,
        conviction: {},
        journal: [],
        cashflows: [],
        arena: {},
        badges: [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  }

  // Upside Circle membership
  const { data: circle } = await admin
    .from(PORTFELL_TABLES.communities)
    .select("id")
    .eq("id", UPSIDE_CIRCLE_ID)
    .maybeSingle();

  if (circle) {
    const isMartin = email === "martin.aasa@upthink.ee";
    const { data: existing } = await admin
      .from(PORTFELL_TABLES.communityMembers)
      .select("user_id, role")
      .eq("community_id", UPSIDE_CIRCLE_ID)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      await admin.from(PORTFELL_TABLES.communityMembers).insert({
        community_id: UPSIDE_CIRCLE_ID,
        user_id: user.id,
        role: isMartin ? "admin" : "member",
      });
      if (isMartin) {
        await admin
          .from(PORTFELL_TABLES.communities)
          .update({
            created_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", UPSIDE_CIRCLE_ID)
          .is("created_by", null);
      }
    }
  }

  return { claimedSlugs };
}
