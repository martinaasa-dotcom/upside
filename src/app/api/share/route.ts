import { NextRequest, NextResponse } from "next/server";
import { requirePortfolioOwner } from "@/lib/auth/ownership";
import { requireOwnerAccess } from "@/lib/owner-pin";
import { mintShareToken } from "@/lib/share-token";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export const dynamic = "force-dynamic";

/** Create a read-only guest share link for your own book / sheet. */
export async function POST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase required for share links" },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    label?: string;
    scope?: "overview" | "sheet" | "lab";
    portfolioId?: string | null;
    daysValid?: number;
  };

  const scope = body.scope ?? "overview";

  if (scope === "sheet") {
    const notOwner = await requirePortfolioOwner(
      auth.user.id,
      body.portfolioId ?? null
    );
    if (notOwner) return notOwner;
    const denied = await requireOwnerAccess(req, body.portfolioId ?? null);
    if (denied) return denied;
  } else {
    // Book-wide share: confirm caller owns at least one portfolio
    const { count } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .select("*", { count: "exact", head: true })
      .eq("owner_id", auth.user.id);
    if (!count) {
      return NextResponse.json(
        { error: "No owned portfolios to share" },
        { status: 400 }
      );
    }
  }
  const { token, tokenHash } = mintShareToken();
  const days = Math.min(90, Math.max(1, Number(body.daysValid ?? 14)));
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.shareLinks)
    .insert({
      token_hash: tokenHash,
      label: body.label?.trim() || "Guest link",
      scope,
      portfolio_id: scope === "sheet" ? body.portfolioId ?? null : null,
      expires_at: expiresAt,
      created_by: auth.user.id,
    })
    .select("id, label, scope, portfolio_id, expires_at, created_at, created_by")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    token,
    path: `/?share=${token}`,
    link: data,
  });
}
