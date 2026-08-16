import { createHash } from "crypto";
import { provisionClassroomSheet } from "@/lib/classroom";
import { clipInviteName } from "@/lib/invite-landing";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  getSupabaseDataClient,
  getSupabaseServer,
} from "@/lib/supabase/server";
import { createSupabaseServerAuth, requireAuthUser } from "@/lib/supabase/server-auth";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const TOKEN_RE = /^[A-Za-z0-9_-]{12,128}$/;

/**
 * Public peek for the sign-in page. Token possession is the only gate.
 * Returns the community name and kind, nothing else.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = checkRateLimit(`invite-peek:${ip}`, 30, 5 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Try again in a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec ?? 60) } }
    );
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ name: null, kind: "community" });
  }

  const { data: invite } = await supabase
    .from(PORTFELL_TABLES.communityInvites)
    .select("community_id, email, expires_at, accepted_at, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  const row = invite as {
    community_id?: string;
    email?: string | null;
    expires_at?: string | null;
    accepted_at?: string | null;
    revoked_at?: string | null;
  } | null;

  if (!row?.community_id || row.revoked_at) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  }

  const { data: community } = await supabase
    .from(PORTFELL_TABLES.communities)
    .select("name, kind")
    .eq("id", row.community_id)
    .maybeSingle();

  const meta = community as { name?: string; kind?: string } | null;
  const classroom = meta?.kind === "classroom";
  return NextResponse.json({
    name: clipInviteName(meta?.name),
    kind: classroom ? "classroom" : "community",
  });
}

/**
 * Accept a community invite token.
 *
 * Redemption goes through a security-definer RPC: the redeemer is by
 * definition not a member yet, so membership-based RLS can never authorize
 * this lookup directly. Possessing the valid token is the grant. Open
 * community links stay reusable. An email list locks the link to those
 * people, and they can all use it.
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
