import { createHash } from "crypto";
import { provisionClassroomSheet } from "@/lib/classroom";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { createSupabaseServerAuth, requireAuthUser } from "@/lib/supabase/server-auth";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
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

  // Cookie-session client, not getSupabaseDataClient() -- this RPC is
  // self-scoped to auth.uid(), which resolves to null (and the RPC just
  // raises "not authenticated") over the service-role client that
  // getSupabaseDataClient() prefers whenever SUPABASE_SERVICE_ROLE_KEY is
  // set, since a service-role connection carries no per-request end-user
  // JWT. The function is still SECURITY DEFINER, so its writes bypass RLS
  // regardless of which client invokes it.
  const supabase = await createSupabaseServerAuth();
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

  const dataClient = await getSupabaseDataClient();
  let name: string | null = null;
  let kind: string | null = null;
  if (dataClient && result.community_id) {
    await provisionClassroomSheet(dataClient, {
      communityId: result.community_id,
      userId: auth.user.id,
    });
    const { data: community } = await dataClient
      .from(PORTFELL_TABLES.communities)
      .select("name, kind")
      .eq("id", result.community_id)
      .maybeSingle();
    name = (community as { name?: string } | null)?.name ?? null;
    kind = (community as { kind?: string } | null)?.kind ?? null;
  }

  return NextResponse.json({
    ok: true,
    communityId: result.community_id,
    name,
    kind,
  });
}
