import { DEMO_HOLDINGS, DEMO_PORTFOLIOS } from "@/lib/demo-store";
import { saveBookSnapshot } from "@/lib/book-snapshot";
import { requirePortfolioOwner } from "@/lib/auth/ownership";
import { requireOwnerAccess } from "@/lib/owner-pin";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "sheet"
  );
}

function mapPortfolio(p: Record<string, unknown>) {
  const { access_secret_hash: _hash, ...rest } = p;
  return {
    ...rest,
    has_access_secret: Boolean(_hash),
  };
}

export async function GET(req: NextRequest) {
  const supabase = getSupabaseServer();

  if (!supabase) {
    return NextResponse.json({
      source: "demo",
      portfolios: DEMO_PORTFOLIOS,
      holdings: DEMO_HOLDINGS,
    });
  }

  const ownerId = req.nextUrl.searchParams.get("ownerId");
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  let portfolioQuery = supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("*")
    .order("sort_order");

  if (ownerId && ownerId !== auth.user.id) {
    // Community peer read — verified in /api/communities/[id]/book
    return NextResponse.json(
      { error: "Use community book endpoint for peer portfolios" },
      { status: 400 }
    );
  }

  portfolioQuery = portfolioQuery.eq("owner_id", auth.user.id);

  const { data: portfolios, error: pErr } = await portfolioQuery;
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

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured — use local demo store" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const { count } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("*", { count: "exact", head: true })
    .eq("owner_id", auth.user.id);

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .insert({
      name,
      slug: slugify(name),
      sort_order: (count ?? 0) + 1,
      cash_balance: 0,
      owner_id: auth.user.id,
    })
    .select(
      "id, name, slug, sort_order, cash_balance, created_at, updated_at, access_secret_hash, owner_id"
    )
    .single();

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

  const denied = await requireOwnerAccess(req, id);
  if (denied) return denied;

  const supabase = getSupabaseServer();
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
    .eq("owner_id", auth.user.id)
    .select(
      "id, name, slug, sort_order, cash_balance, created_at, updated_at, access_secret_hash, owner_id"
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

  const denied = await requireOwnerAccess(req, id);
  if (denied) return denied;

  const supabase = getSupabaseServer();
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
      .eq("id", id)
      .eq("owner_id", auth.user.id);
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
