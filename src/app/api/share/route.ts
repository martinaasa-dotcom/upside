import { NextRequest, NextResponse } from "next/server";
import { requireOwnerPin } from "@/lib/owner-pin";
import { mintShareToken } from "@/lib/share-token";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export const dynamic = "force-dynamic";

/** Create a read-only share link (PIN required). */
export async function POST(req: NextRequest) {
  const denied = requireOwnerPin(req);
  if (denied) return denied;

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
    })
    .select("id, label, scope, portfolio_id, expires_at, created_at")
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
