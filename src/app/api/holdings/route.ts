import { requireOwnerPin } from "@/lib/owner-pin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireOwnerPin(req);
  if (denied) return denied;

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured — use local demo store" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const portfolioId = body.portfolio_id as string;
  const ticker = String(body.ticker ?? "")
    .trim()
    .toUpperCase();
  if (!portfolioId || !ticker) {
    return NextResponse.json(
      { error: "portfolio_id and ticker required" },
      { status: 400 }
    );
  }

  const row = {
    portfolio_id: portfolioId,
    ticker,
    shares: Number(body.shares),
    buy_price: Number(body.buy_price),
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
  const denied = requireOwnerPin(req);
  if (denied) return denied;

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured — use local demo store" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const id = body.id as string;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

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
      if (key === "ticker") patch[key] = String(body[key]).toUpperCase();
      else if (
        (key === "eoy_target" || key === "stock_target_override") &&
        body[key] === null
      ) {
        patch[key] = null;
      } else patch[key] = Number(body[key]);
    }
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
  const denied = requireOwnerPin(req);
  if (denied) return denied;

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured — use local demo store" },
      { status: 400 }
    );
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
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
