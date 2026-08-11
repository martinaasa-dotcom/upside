import { createHash } from "crypto";
import { ensureProfileAndClaims } from "@/lib/auth/ensure-profile";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Accept a portfolio co-owner invite code. */
export async function POST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  await ensureProfileAndClaims(auth.user);

  const body = (await req.json().catch(() => ({}))) as {
    code?: string;
    token?: string;
  };
  const raw = (body.code ?? body.token ?? "").trim();
  if (!raw || raw.length < 12) {
    return NextResponse.json({ error: "Invite code required" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const { data: invite, error } = await supabase
    .from(PORTFELL_TABLES.portfolioInvites)
    .select("*")
    .eq("token_hash", hashToken(raw))
    .maybeSingle();

  if (error || !invite) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 404 });
  }

  const row = invite as {
    id: string;
    portfolio_id: string;
    email: string | null;
    expires_at: string | null;
    accepted_at: string | null;
    revoked_at: string | null;
  };

  if (row.revoked_at || row.accepted_at) {
    return NextResponse.json(
      { error: "Invite no longer valid" },
      { status: 410 }
    );
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
      { error: "This invite is for a different email" },
      { status: 403 }
    );
  }

  const { error: ownErr } = await supabase
    .from(PORTFELL_TABLES.portfolioOwners)
    .upsert(
      {
        portfolio_id: row.portfolio_id,
        user_id: auth.user.id,
      },
      { onConflict: "portfolio_id,user_id" }
    );

  if (ownErr) {
    return NextResponse.json({ error: ownErr.message }, { status: 500 });
  }

  await supabase
    .from(PORTFELL_TABLES.portfolioInvites)
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", row.id);

  const { data: sheet } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("id, name, slug")
    .eq("id", row.portfolio_id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    portfolioId: row.portfolio_id,
    portfolio: sheet,
  });
}
