import { createHash } from "crypto";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Accept a community invite token.
 *
 * Redemption goes through a security-definer RPC: the redeemer is by
 * definition not a member yet, so membership-based RLS can never authorize
 * this lookup directly — possessing the valid token is what should grant
 * access to that one invite row, not an existing relationship.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as { token?: string };
  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc(
    "portfell_redeem_community_invite",
    { p_token_hash: hashToken(token) }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = data as { ok: boolean; error?: string; community_id?: string };
  if (!result?.ok) {
    return NextResponse.json(
      { error: result?.error ?? "Invalid invite" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    communityId: result.community_id,
  });
}
