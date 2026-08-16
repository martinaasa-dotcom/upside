import { createHash, randomBytes } from "crypto";
import { userIsCommunityAdmin } from "@/lib/auth/ownership";
import {
  inviteEmailAllowlist,
  storeInviteEmails,
} from "@/lib/invite-emails";
import { PRODUCT_NAME, PRODUCT_ORIGIN } from "@/lib/product";
import { noteEmailConfigured, sendNoteEmail } from "@/lib/send-note";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Admin: create invite link. Optional emails lock it to those people
 * and get the link in their inbox. The link stays reusable. */
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

  const allow = inviteEmailAllowlist(body.email);
  if (!allow.ok) {
    return NextResponse.json({ error: allow.error }, { status: 400 });
  }

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
      email: storeInviteEmails(allow.emails),
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

  const path = `/communities/join?token=${token}`;
  let emailed = 0;
  if (allow.emails.length > 0 && noteEmailConfigured()) {
    const { data: community } = await supabase
      .from(PORTFELL_TABLES.communities)
      .select("name, kind")
      .eq("id", id)
      .maybeSingle();
    const meta = community as { name?: string; kind?: string } | null;
    const classroom = meta?.kind === "classroom";
    const name = meta?.name?.trim() || (classroom ? "a class" : "a community");
    const url = `${PRODUCT_ORIGIN}${path}`;
    const subject = `You've been invited to join ${name}`;
    const text = [
      `You've been invited to join ${name} on ${PRODUCT_NAME}.`,
      `Open this link and sign in with Google: ${url}`,
      "If you didn't expect this, ignore it.",
    ].join("\n\n");
    for (const to of allow.emails) {
      const ok = await sendNoteEmail({ to, subject, text });
      if (ok) emailed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    token,
    path,
    emailed,
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
