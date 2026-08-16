import { createHash, randomBytes } from "crypto";
import { userIsCommunityAdmin } from "@/lib/auth/ownership";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Admin: create invite link (token) and optional email claim. */
export async function POST(req: NextRequest, ctx: Ctx) {
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
    email?: string;
    role?: "admin" | "member";
    daysValid?: number | string | null;
  };

  const token = randomBytes(24).toString("base64url");
  let expiresAt: string | null = null;
  if (body.daysValid != null && body.daysValid !== "") {
    const days = Math.floor(Number(body.daysValid));
    if (!Number.isFinite(days) || days < 1) {
      return NextResponse.json(
        { error: "Days must be at least 1." },
        { status: 400 }
      );
    }
    expiresAt = new Date(
      Date.now() + Math.min(365, days) * 86400000
    ).toISOString();
  }

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.communityInvites)
    .insert({
      community_id: id,
      email: body.email?.trim().toLowerCase() || null,
      token_hash: hashToken(token),
      role: body.role === "admin" ? "admin" : "member",
      created_by: auth.user.id,
      expires_at: expiresAt,
    })
    .select("id, email, role, expires_at, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    token,
    path: `/communities/join?token=${token}`,
    invite: data,
  });
}

/** Admin: list invites. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  if (!(await userIsCommunityAdmin(auth.user.id, id))) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ invites: [] });
  }

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.communityInvites)
    .select("id, email, role, expires_at, accepted_at, revoked_at, created_at")
    .eq("community_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ invites: data ?? [] });
}
