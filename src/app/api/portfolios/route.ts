import { DEMO_HOLDINGS, DEMO_PORTFOLIOS } from "@/lib/demo-store";
import { saveBookSnapshot } from "@/lib/book-snapshot";
import { ensureProfileAndClaims } from "@/lib/auth/ensure-profile";
import {
  listOwnedPortfolioIds,
  requirePortfolioOwner,
} from "@/lib/auth/ownership";
import { createSupabaseServerAuth, requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function mapPortfolio(p: Record<string, unknown>) {
  return p;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  await ensureProfileAndClaims(auth.user);

  const supabase = await getSupabaseDataClient();

  if (!supabase) {
    return NextResponse.json({
      source: "demo",
      portfolios: DEMO_PORTFOLIOS,
      holdings: DEMO_HOLDINGS,
    });
  }

  const ownerId = req.nextUrl.searchParams.get("ownerId");
  if (ownerId && ownerId !== auth.user.id) {
    return NextResponse.json(
      { error: "Use community book endpoint for peer portfolios" },
      { status: 400 }
    );
  }

  const ownedIds = await listOwnedPortfolioIds(auth.user.id);
  if (!ownedIds.length) {
    return NextResponse.json({
      source: "supabase",
      portfolios: [],
      holdings: [],
    });
  }

  const { data: portfolios, error: pErr } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("*")
    .in("id", ownedIds)
    .order("sort_order");

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const portfolioIds = (portfolios ?? []).map(
    (p) => (p as { id: string }).id
  );
  let holdings: unknown[] = [];
  if (portfolioIds.length) {
    const { data: h, error: hErr } = await supabase
      .from(PORTFELL_TABLES.holdings)
      .select("*")
      .in("portfolio_id", portfolioIds)
      .order("sort_order");
    if (hErr) {
      return NextResponse.json({ error: hErr.message }, { status: 500 });
    }
    holdings = h ?? [];
  }

  return NextResponse.json({
    source: "supabase",
    portfolios: (portfolios ?? []).map((p) =>
      mapPortfolio(p as Record<string, unknown>)
    ),
    holdings,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  // Security-definer RPC, not a plain insert + upsert: creating a sheet and
  // adding yourself as its owner is a self-service "do this for auth.uid()"
  // operation, the same class of thing that's needed a security-definer
  // path elsewhere in this schema (seed claims, invite redemption, account
  // deletion) rather than ordinary ownership-based RLS, which can't cleanly
  // express "this row doesn't have an owner yet, I'm about to become it".
  // Also atomic (no risk of an orphaned, owner-less portfolio if a second
  // write failed) and handles slug collisions instead of 500ing when two
  // people separately name a sheet the same thing.
  //
  // Deliberately the cookie-session client, NOT getSupabaseDataClient() —
  // that prefers the service-role client whenever SUPABASE_SERVICE_ROLE_KEY
  // is set (true in production), and a service-role connection carries no
  // per-request end-user JWT, so auth.uid() inside this function resolves
  // to null and the RPC always raises "not authenticated". The function
  // itself is still SECURITY DEFINER, so its internal writes bypass RLS
  // regardless of which client invokes it — this only affects whether
  // auth.uid() correctly identifies who's calling.
  const authedSupabase = await createSupabaseServerAuth();
  if (!authedSupabase) {
    return NextResponse.json(
      { error: "Supabase not configured, use local demo store" },
      { status: 400 }
    );
  }
  const { data, error } = await authedSupabase.rpc(
    "portfell_create_portfolio_for_me",
    { p_name: name }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    portfolio: mapPortfolio(data as Record<string, unknown>),
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const id = body.id as string;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const notOwner = await requirePortfolioOwner(auth.user.id, id);
  if (notOwner) return notOwner;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.cash_balance !== undefined) {
    patch.cash_balance = Number(body.cash_balance);
  }
  if (body.name !== undefined) patch.name = body.name;

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .update(patch)
    .eq("id", id)
    .select(
      "id, name, slug, sort_order, cash_balance, created_at, updated_at, owner_id"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    portfolio: mapPortfolio(data as Record<string, unknown>),
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const notOwner = await requirePortfolioOwner(auth.user.id, id);
  if (notOwner) return notOwner;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  try {
    const { data: sheet } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .select("name")
      .eq("id", id)
      .maybeSingle();

    await saveBookSnapshot(
      supabase,
      "pre_delete",
      sheet?.name
        ? `Before delete · ${sheet.name}`
        : "Before delete"
    );

    const { error } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .delete()
      .eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to snapshot before delete",
      },
      { status: 500 }
    );
  }
}
