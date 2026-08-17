import { createHash } from "crypto";
import { ensureProfileAndClaims } from "@/lib/auth/ensure-profile";
import { createSupabaseServerAuth, requireAuthUser } from "@/lib/supabase/server-auth";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { portfolioJoinSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

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
async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  await ensureProfileAndClaims(auth.user);

  const parsed = await parseJsonBody(req, portfolioJoinSchema);
  if (!parsed.ok) return parsed.response;
  const raw = (parsed.data.code ?? parsed.data.token ?? "").trim();
  if (!raw || raw.length < 12) {
    return NextResponse.json({ error: "Invite code required" }, { status: 400 });
  }

  // Cookie-session client, not getSupabaseDataClient() -- this RPC is
  // self-scoped to auth.uid(), which resolves to null (and the RPC just
  // raises "not authenticated") over the service-role client that
  // getSupabaseDataClient() prefers whenever SUPABASE_SERVICE_ROLE_KEY is
  // set, since a service-role connection carries no per-request end-user
  // JWT. The function is still SECURITY DEFINER, so its writes bypass RLS
  // regardless of which client invokes it. The follow-up select below
  // stays on this same client too -- by then the RPC has already
  // committed the ownership row, so normal RLS correctly allows it.
  const supabase = await createSupabaseServerAuth();
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
  if (!result?.ok || !result.portfolio_id) {
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

export const POST = observeRoute(handlePOST, '/api/portfolios/join');
