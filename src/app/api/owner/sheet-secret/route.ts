import { hashAccessSecret, verifyAccessSecret } from "@/lib/access-secret";
import {
  isMasterSecret,
  readProvidedSecret,
  requireOwnerAccess,
  sheetIsLocked,
} from "@/lib/owner-pin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Set or clear a per-sheet PIN/password.
 * - First lock on an open sheet: no prior secret required.
 * - Change/clear on a locked sheet: requires that sheet’s current secret
 *   (or optional UPSIDE_OWNER_PIN admin override).
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

  const locked = await sheetIsLocked(portfolioId);
  if (locked) {
    const denied = await requireOwnerAccess(req, portfolioId);
    if (denied) return denied;
  }

  if (body.clear) {
    if (!locked) {
      return NextResponse.json({ ok: true, hasAccessSecret: false });
    }
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

  // Don’t store a custom hash that only matches the optional admin env pin
  if (isMasterSecret(nextSecret)) {
    return NextResponse.json(
      {
        error:
          "Pick a different PIN/password — that one is reserved for admin override",
      },
      { status: 400 }
    );
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

  if (!verifyAccessSecret(nextSecret, hash)) {
    return NextResponse.json({ error: "Hash verify failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    hasAccessSecret: true,
    unlockedWith: isMasterSecret(readProvidedSecret(req)) ? "admin" : "sheet",
  });
}
