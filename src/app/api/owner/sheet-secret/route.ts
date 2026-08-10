import { hashAccessSecret, verifyAccessSecret } from "@/lib/access-secret";
import {
  isMasterSecret,
  readProvidedSecret,
  requireOwnerAccess,
} from "@/lib/owner-pin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Set or clear a per-sheet PIN/password.
 * - Setting/clearing requires book default secret OR the sheet's current secret.
 * - Clearing always leaves the sheet on the book default (UPSIDE_OWNER_PIN).
 */
export async function POST(req: Request) {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    portfolioId?: string;
    secret?: string;
    clear?: boolean;
  };
  const portfolioId = String(body.portfolioId ?? "").trim();
  if (!portfolioId) {
    return NextResponse.json({ error: "portfolioId required" }, { status: 400 });
  }

  const denied = await requireOwnerAccess(req, portfolioId);
  if (denied) return denied;

  if (body.clear) {
    const { error } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .update({
        access_secret_hash: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", portfolioId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, hasAccessSecret: false });
  }

  const nextSecret = String(body.secret ?? "").trim();
  if (nextSecret.length < 4) {
    return NextResponse.json(
      { error: "PIN/password must be at least 4 characters" },
      { status: 400 }
    );
  }
  if (nextSecret.length > 128) {
    return NextResponse.json(
      { error: "PIN/password too long (max 128)" },
      { status: 400 }
    );
  }

  // Changing away from book default: allow; if setting same as master, just clear custom
  if (isMasterSecret(nextSecret)) {
    const { error } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .update({
        access_secret_hash: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", portfolioId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      hasAccessSecret: false,
      note: "Matches book default — sheet uses the shared owner secret",
    });
  }

  const hash = hashAccessSecret(nextSecret);
  const { error } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .update({
      access_secret_hash: hash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", portfolioId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Confirm round-trip
  if (!verifyAccessSecret(nextSecret, hash)) {
    return NextResponse.json({ error: "Hash verify failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    hasAccessSecret: true,
    unlockedWith: isMasterSecret(readProvidedSecret(req)) ? "book" : "sheet",
  });
}
