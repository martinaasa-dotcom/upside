import { createHash } from "crypto";
import { ensureProfileAndClaims } from "@/lib/auth/ensure-profile";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Accept a portfolio co-owner invite code.
 *
 * Redemption goes through a security-definer RPC: the redeemer is by
 * definition not a co-owner yet, so ownership-based RLS can never authorize
 * this lookup directly — possessing the valid token is what should grant
 * access to that one invite row, not an existing relationship.
 */
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

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc(
    "portfell_redeem_portfolio_invite",
    { p_token_hash: hashToken(raw) }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = data as { ok: boolean; error?: string; portfolio_id?: string };
  if (!result?.ok) {
    return NextResponse.json(
      { error: result?.error ?? "Invalid invite code" },
      { status: 404 }
    );
  }

  const { data: sheet } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("id, name, slug")
    .eq("id", result.portfolio_id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    portfolioId: result.portfolio_id,
    portfolio: sheet,
  });
}
