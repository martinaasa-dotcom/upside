import { listOwnedPortfolioIds } from "@/lib/auth/ownership";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import type { BookSnapshotPayload } from "@/lib/book-snapshot";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Last ~14 nightly mark-to-market NAVs for the caller's own sheets.
 * Nightly rows are global (one snapshot for the platform). We only ever
 * sum the caller's portfolio ids, and never send other people's marks.
 */
export async function GET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const owned = await listOwnedPortfolioIds(auth.user.id);
  if (owned.length === 0) {
    return NextResponse.json({ points: [] });
  }
  const ownedSet = new Set(owned);

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.snapshots)
    .select("created_at, payload")
    .eq("kind", "nightly")
    .order("created_at", { ascending: true })
    .limit(14);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const points: { date: string; nav: number }[] = [];
  for (const row of data ?? []) {
    const payload = row.payload as BookSnapshotPayload | null;
    const marks = payload?.marks;
    if (!marks?.navByPortfolio) continue;
    let nav = 0;
    let hit = false;
    for (const [id, value] of Object.entries(marks.navByPortfolio)) {
      if (!ownedSet.has(id)) continue;
      hit = true;
      nav += Number(value) || 0;
    }
    if (!hit) continue;
    points.push({
      date: String(row.created_at).slice(0, 10),
      nav,
    });
  }

  return NextResponse.json({ points });
}
