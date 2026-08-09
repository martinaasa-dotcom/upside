import { getSupabaseServer } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured — use local demo store" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { data, error } = await supabase
    .from("holdings")
    .insert({
      portfolio_id: body.portfolio_id,
      ticker: String(body.ticker).toUpperCase(),
      shares: Number(body.shares),
      buy_price: Number(body.buy_price),
      eoy_target: body.eoy_target != null ? Number(body.eoy_target) : null,
      target_call_pct: Number(body.target_call_pct ?? 0.15),
      stock_target_override:
        body.stock_target_override != null
          ? Number(body.stock_target_override)
          : null,
      sort_order: Number(body.sort_order ?? 99),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ holding: data });
}

export async function PATCH(req: NextRequest) {
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
    .from("holdings")
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

  const { error } = await supabase.from("holdings").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
