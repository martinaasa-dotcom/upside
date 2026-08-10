import { NextRequest, NextResponse } from "next/server";
import { emptyLabBundle } from "@/lib/lab-bundle";
import { hashShareToken } from "@/lib/share-token";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { defaultArena } from "@/lib/paper-arena";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/** Resolve a share token → read-only book snapshot (no PIN). */
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const raw = token?.trim();
  if (!raw || raw.length < 16) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const tokenHash = hashShareToken(raw);
  const { data: link, error: linkErr } = await supabase
    .from(PORTFELL_TABLES.shareLinks)
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }
  if (!link || link.revoked_at) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  const { data: portfolios, error: pErr } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("*")
    .order("sort_order");
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  let holdingsQuery = supabase.from(PORTFELL_TABLES.holdings).select("*");
  if (link.scope === "sheet" && link.portfolio_id) {
    holdingsQuery = holdingsQuery.eq("portfolio_id", link.portfolio_id);
  }
  const { data: holdings, error: hErr } = await holdingsQuery.order("sort_order");
  if (hErr) {
    return NextResponse.json({ error: hErr.message }, { status: 500 });
  }

  let lab = emptyLabBundle();
  if (link.scope === "lab" || link.scope === "overview") {
    const { data: labRow } = await supabase
      .from(PORTFELL_TABLES.labState)
      .select("*")
      .eq("id", "book")
      .maybeSingle();
    if (labRow) {
      lab = {
        conviction: labRow.conviction ?? {},
        journal: [],
        cashflows: Array.isArray(labRow.cashflows) ? labRow.cashflows : [],
        arena:
          labRow.arena && typeof labRow.arena === "object"
            ? { ...defaultArena(), ...labRow.arena }
            : defaultArena(),
        badges: Array.isArray(labRow.badges) ? labRow.badges : [],
        updatedAt: labRow.updated_at,
      };
    }
  }

  const filteredPortfolios =
    link.scope === "sheet" && link.portfolio_id
      ? (portfolios ?? []).filter((p) => p.id === link.portfolio_id)
      : portfolios ?? [];

  return NextResponse.json({
    ok: true,
    guest: true,
    scope: link.scope,
    label: link.label,
    expiresAt: link.expires_at,
    portfolios: filteredPortfolios,
    holdings: holdings ?? [],
    lab,
  });
}
