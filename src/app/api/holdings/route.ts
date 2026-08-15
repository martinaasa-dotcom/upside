import { requirePortfolioOwner } from "@/lib/auth/ownership";
import { holdingWriteActions } from "@/lib/classroom";
import { denyClassroomWrite } from "@/lib/classroom-guard";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { normalizeYahooTicker } from "@/lib/ticker";
import { roundMoney, roundShares } from "@/lib/money";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const portfolioId = body.portfolio_id as string;
  const ticker = normalizeYahooTicker(String(body.ticker ?? ""));
  if (!portfolioId || !ticker) {
    return NextResponse.json(
      { error: "portfolio_id and ticker required" },
      { status: 400 }
    );
  }

  const notOwner = await requirePortfolioOwner(auth.user.id, portfolioId);
  if (notOwner) return notOwner;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured, use local demo store" },
      { status: 400 }
    );
  }

  const shares = roundShares(Number(body.shares));
  const buyPrice = roundMoney(Number(body.buy_price));
  if (!Number.isFinite(shares) || shares <= 0) {
    return NextResponse.json({ error: "Shares must be a positive number" }, { status: 400 });
  }
  if (!Number.isFinite(buyPrice) || buyPrice <= 0) {
    return NextResponse.json({ error: "Buy price must be a positive number" }, { status: 400 });
  }

  const { data: existingRow } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .select("shares")
    .eq("portfolio_id", portfolioId)
    .eq("ticker", ticker)
    .maybeSingle();
  const blocked = await denyClassroomWrite(supabase, {
    portfolioId,
    userId: auth.user.id,
    action: holdingWriteActions({
      isNew: !existingRow,
      isDelete: false,
      existingShares: existingRow
        ? Number((existingRow as { shares: number }).shares)
        : 0,
      nextShares: shares,
    }),
  });
  if (blocked) return blocked;

  const row = {
    portfolio_id: portfolioId,
    ticker,
    shares,
    buy_price: buyPrice,
    eoy_target: body.eoy_target != null ? Number(body.eoy_target) : null,
    target_call_pct: Number(body.target_call_pct ?? 0.15),
    stock_target_override:
      body.stock_target_override != null
        ? Number(body.stock_target_override)
        : null,
    sort_order: Number(body.sort_order ?? 99),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .upsert(row, { onConflict: "portfolio_id,ticker" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ holding: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const id = body.id as string;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured, use local demo store" },
      { status: 400 }
    );
  }

  const { data: existing } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .select("portfolio_id, shares, ticker")
    .eq("id", id)
    .maybeSingle();

  const portfolioId =
    (existing as { portfolio_id?: string } | null)?.portfolio_id ??
    (body.portfolio_id as string | undefined) ??
    null;

  const notOwner = await requirePortfolioOwner(auth.user.id, portfolioId);
  if (notOwner) return notOwner;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of [
    "ticker",
    "shares",
    "buy_price",
    "eoy_target",
    "target_call_pct",
    "stock_target_override",
    "sort_order",
  ]) {
    if (body[key] !== undefined) {
      if (key === "ticker") patch[key] = normalizeYahooTicker(String(body[key]));
      else if (
        (key === "eoy_target" || key === "stock_target_override") &&
        body[key] === null
      ) {
        patch[key] = null;
      } else if (key === "shares") {
        const n = roundShares(Number(body[key]));
        if (!Number.isFinite(n) || n <= 0) {
          return NextResponse.json(
            { error: "Shares must be a positive number" },
            { status: 400 }
          );
        }
        patch[key] = n;
      } else if (key === "buy_price") {
        patch[key] = roundMoney(Number(body[key]));
      } else patch[key] = Number(body[key]);
    }
  }

  if (portfolioId) {
    const nextShares =
      body.shares !== undefined
        ? roundShares(Number(body.shares))
        : Number((existing as { shares?: number } | null)?.shares ?? 0);
    const nextTicker =
      body.ticker !== undefined
        ? normalizeYahooTicker(String(body.ticker))
        : String((existing as { ticker?: string } | null)?.ticker ?? "");
    const prevTicker = String(
      (existing as { ticker?: string } | null)?.ticker ?? ""
    );
    const blocked = await denyClassroomWrite(supabase, {
      portfolioId,
      userId: auth.user.id,
      action: holdingWriteActions({
        isNew: false,
        isDelete: false,
        existingShares: Number((existing as { shares?: number } | null)?.shares ?? 0),
        nextShares,
        tickerChanged:
          Boolean(prevTicker) &&
          Boolean(nextTicker) &&
          prevTicker.toUpperCase() !== nextTicker.toUpperCase(),
      }),
    });
    if (blocked) return blocked;
  }

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ holding: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured, use local demo store" },
      { status: 400 }
    );
  }

  const { data: existing } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .select("portfolio_id")
    .eq("id", id)
    .maybeSingle();

  const portfolioId =
    (existing as { portfolio_id?: string } | null)?.portfolio_id ?? null;

  const notOwner = await requirePortfolioOwner(auth.user.id, portfolioId);
  if (notOwner) return notOwner;

  if (portfolioId) {
    const blocked = await denyClassroomWrite(supabase, {
      portfolioId,
      userId: auth.user.id,
      action: "sell",
    });
    if (blocked) return blocked;
  }

  const { error } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .delete()
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
