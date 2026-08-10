import { NextRequest, NextResponse } from "next/server";
import { requireOwnerPin } from "@/lib/owner-pin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export const dynamic = "force-dynamic";

type ImportRow = {
  ticker: string;
  shares: number;
  buy_price: number;
  target_call_pct?: number;
};

/**
 * Atomic-ish sheet import: set cash (optional) + upsert all equity rows.
 * Avoids stale client holdings closures and partial fire-and-forget loops.
 */
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

  const body = (await req.json().catch(() => ({}))) as {
    portfolio_id?: string;
    cash?: number | null;
    holdings?: ImportRow[];
  };

  const portfolioId = body.portfolio_id?.trim();
  if (!portfolioId) {
    return NextResponse.json({ error: "portfolio_id required" }, { status: 400 });
  }

  const rows = Array.isArray(body.holdings) ? body.holdings : [];
  if (rows.length === 0 && body.cash == null) {
    return NextResponse.json(
      { error: "cash or holdings required" },
      { status: 400 }
    );
  }

  let cashUpdated = false;
  if (body.cash != null && Number.isFinite(Number(body.cash))) {
    const { error } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .update({
        cash_balance: Number(body.cash),
        updated_at: new Date().toISOString(),
      })
      .eq("id", portfolioId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    cashUpdated = true;
  }

  const { data: existing, error: exErr } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .select("id, ticker, sort_order")
    .eq("portfolio_id", portfolioId);
  if (exErr) {
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }

  const byTicker = new Map(
    (existing ?? []).map((h) => [String(h.ticker).toUpperCase(), h])
  );
  let sortBase = (existing ?? []).length;
  let upserted = 0;
  const failed: string[] = [];

  for (const row of rows) {
    const ticker = String(row.ticker ?? "")
      .trim()
      .toUpperCase();
    if (!ticker) continue;
    const shares = Number(row.shares);
    const buyPrice = Number(row.buy_price);
    const callPct = Number(row.target_call_pct ?? 0.15);
    if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(buyPrice)) {
      failed.push(ticker || "?");
      continue;
    }

    const prev = byTicker.get(ticker);
    if (prev) {
      const { error } = await supabase
        .from(PORTFELL_TABLES.holdings)
        .update({
          shares,
          buy_price: buyPrice,
          target_call_pct: callPct,
          updated_at: new Date().toISOString(),
        })
        .eq("id", prev.id);
      if (error) failed.push(ticker);
      else upserted += 1;
    } else {
      sortBase += 1;
      const { data, error } = await supabase
        .from(PORTFELL_TABLES.holdings)
        .upsert(
          {
            portfolio_id: portfolioId,
            ticker,
            shares,
            buy_price: buyPrice,
            target_call_pct: callPct,
            sort_order: sortBase,
          },
          { onConflict: "portfolio_id,ticker" }
        )
        .select("id, ticker, sort_order")
        .single();
      if (error) failed.push(ticker);
      else {
        upserted += 1;
        if (data) byTicker.set(ticker, data);
      }
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    cashUpdated,
    upserted,
    failed,
    total: rows.length,
  });
}
