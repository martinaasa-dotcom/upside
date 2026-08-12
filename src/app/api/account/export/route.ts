import { listOwnedPortfolioIds } from "@/lib/auth/ownership";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Self-service data export — everything the signed-in user can see about
 * themselves, as one JSON file. Read-only, RLS-scoped to their own session
 * (no service role needed): profile, the sheets they own/co-own plus
 * holdings, and their Lab state.
 */
export async function GET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const [profileRes, portfolioIds, labRes] = await Promise.all([
    supabase
      .from(PORTFELL_TABLES.profiles)
      .select("*")
      .eq("id", auth.user.id)
      .maybeSingle(),
    listOwnedPortfolioIds(auth.user.id),
    supabase
      .from(PORTFELL_TABLES.labState)
      .select("*")
      .eq("owner_id", auth.user.id)
      .maybeSingle(),
  ]);

  let portfolios: unknown[] = [];
  let holdings: unknown[] = [];
  if (portfolioIds.length > 0) {
    const [pRes, hRes] = await Promise.all([
      supabase
        .from(PORTFELL_TABLES.portfolios)
        .select("*")
        .in("id", portfolioIds),
      supabase
        .from(PORTFELL_TABLES.holdings)
        .select("*")
        .in("portfolio_id", portfolioIds),
    ]);
    portfolios = pRes.data ?? [];
    holdings = hRes.data ?? [];
  }

  const exportPayload = {
    exported_at: new Date().toISOString(),
    account: {
      user_id: auth.user.id,
      email: auth.user.email ?? null,
    },
    profile: profileRes.data ?? null,
    portfolios,
    holdings,
    lab_state: labRes.data ?? null,
  };

  return NextResponse.json(exportPayload, {
    headers: {
      "Content-Disposition": `attachment; filename="upside-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
