import { createHash } from "crypto";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Accept a community invite token. */
export async function POST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as { token?: string };
  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { data: invite, error } = await supabase
    .from(PORTFELL_TABLES.communityInvites)
    .select("*")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (error || !invite) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }

  const row = invite as {
    community_id: string;
    email: string | null;
    role: string;
    expires_at: string | null;
    accepted_at: string | null;
    revoked_at: string | null;
    id: string;
  };

  if (row.revoked_at || row.accepted_at) {
    return NextResponse.json({ error: "Invite no longer valid" }, { status: 410 });
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }
  if (
    row.email &&
    auth.user.email &&
    row.email.toLowerCase() !== auth.user.email.toLowerCase()
  ) {
    return NextResponse.json(
      { error: "Invite is for a different email" },
      { status: 403 }
    );
  }

  const { error: mErr } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .upsert(
      {
        community_id: row.community_id,
        user_id: auth.user.id,
        role: row.role === "admin" ? "admin" : "member",
      },
      { onConflict: "community_id,user_id" }
    );

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  await supabase
    .from(PORTFELL_TABLES.communityInvites)
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", row.id);

  return NextResponse.json({
    ok: true,
    communityId: row.community_id,
  });
}
