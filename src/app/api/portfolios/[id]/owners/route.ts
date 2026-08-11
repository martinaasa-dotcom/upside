import {
  addCoOwnerToPortfolio,
  requirePortfolioOwner,
} from "@/lib/auth/ownership";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** List co-owners for a portfolio (caller must be a co-owner). */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const notOwner = await requirePortfolioOwner(auth.user.id, id);
  if (notOwner) return notOwner;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ owners: [] });
  }

  const { data: rows, error } = await supabase
    .from(PORTFELL_TABLES.portfolioOwners)
    .select("user_id, created_at")
    .eq("portfolio_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const userIds = ((rows ?? []) as { user_id: string }[]).map((r) => r.user_id);
  const { data: profiles } = userIds.length
    ? await supabase
        .from(PORTFELL_TABLES.profiles)
        .select("id, email, display_name, avatar_url")
        .in("id", userIds)
    : { data: [] };

  const byId = new Map(
    ((profiles ?? []) as { id: string }[]).map((p) => [p.id, p])
  );

  return NextResponse.json({
    owners: ((rows ?? []) as { user_id: string; created_at: string }[]).map(
      (r) => ({
        user_id: r.user_id,
        created_at: r.created_at,
        profile: byId.get(r.user_id) ?? null,
      })
    ),
  });
}

/** Add a co-owner by email. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const notOwner = await requirePortfolioOwner(auth.user.id, id);
  if (notOwner) return notOwner;

  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = String(body.email ?? "").trim();
  const result = await addCoOwnerToPortfolio(id, email);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }
  return NextResponse.json({ ok: true, userId: result.userId });
}
