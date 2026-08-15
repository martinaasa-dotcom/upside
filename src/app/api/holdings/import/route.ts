import { NextRequest, NextResponse } from "next/server";
import { requirePortfolioOwner } from "@/lib/auth/ownership";
import { classifyImportWrite } from "@/lib/classroom";
import { denyClassroomWrite } from "@/lib/classroom-guard";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { normalizeYahooTicker, resolveImportTicker } from "@/lib/ticker";

export const dynamic = "force-dynamic";

type ImportRow = {
  ticker: string;
  shares: number;
  buy_price: number;
  target_call_pct?: number;
  isin?: string;
};

/**
 * Atomic-ish sheet import: set cash (optional) + upsert all equity rows.
 * Optional replace removes holdings not present in the payload.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured, use local demo store" },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    portfolio_id?: string;
    cash?: number | null;
    replace?: boolean;
    holdings?: ImportRow[];
  };

  const portfolioId = body.portfolio_id?.trim();
  if (!portfolioId) {
    return NextResponse.json({ error: "portfolio_id required" }, { status: 400 });
  }

  const notOwner = await requirePortfolioOwner(auth.user.id, portfolioId);
  if (notOwner) return notOwner;

  const rows = Array.isArray(body.holdings) ? body.holdings : [];
  if (rows.length === 0 && body.cash == null) {
    return NextResponse.json(
      { error: "cash or holdings required" },
      { status: 400 }
    );
  }

  const { data: existing, error: exErr } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .select("id, ticker, shares, sort_order")
    .eq("portfolio_id", portfolioId);
  if (exErr) {
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }

  const replacing = body.replace !== false && rows.length > 0;
  const blocked = await denyClassroomWrite(supabase, {
    portfolioId,
    userId: auth.user.id,
    action: classifyImportWrite({
      cash: body.cash != null,
      replace: replacing,
      rows: rows.map((row) => ({
        ticker:
          resolveImportTicker(String(row.ticker ?? ""), row.isin) ||
          normalizeYahooTicker(String(row.ticker ?? "")),
        shares: Number(row.shares),
      })),
      existing: ((existing ?? []) as { ticker: string; shares: number }[]).map(
        (h) => ({ ticker: String(h.ticker), shares: Number(h.shares) })
      ),
    }),
  });
  if (blocked) return blocked;

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

  const byTicker = new Map(
    (existing ?? []).map((h) => [String(h.ticker).toUpperCase(), h])
  );
  let sortBase = (existing ?? []).length;
  let upserted = 0;
  const failed: string[] = [];
  const keep = new Set<string>();

  for (const row of rows) {
    const ticker = resolveImportTicker(
      String(row.ticker ?? ""),
      row.isin
    ) || normalizeYahooTicker(String(row.ticker ?? ""));
    if (!ticker) continue;
    const shares = Number(row.shares);
    const buyPrice = Number(row.buy_price);
    const callPct = Number(row.target_call_pct ?? 0.15);
    if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(buyPrice) || !(buyPrice > 0)) {
      failed.push(ticker || "?");
      continue;
    }

    keep.add(ticker.toUpperCase());
    const prev = byTicker.get(ticker.toUpperCase());
    if (prev) {
      const { error } = await supabase
        .from(PORTFELL_TABLES.holdings)
        .update({
          ticker,
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
        if (data) byTicker.set(String(data.ticker).toUpperCase(), data);
      }
    }
  }

  let removed = 0;
  if (body.replace !== false && rows.length > 0) {
    const toRemove = (existing ?? []).filter(
      (h) => !keep.has(String(h.ticker).toUpperCase())
    );
    for (const h of toRemove) {
      const { error } = await supabase
        .from(PORTFELL_TABLES.holdings)
        .delete()
        .eq("id", h.id);
      if (!error) removed += 1;
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    cashUpdated,
    upserted,
    removed,
    failed,
    total: rows.length,
  });
}
