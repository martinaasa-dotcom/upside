import { NextRequest, NextResponse } from "next/server";
import { requirePortfolioOwner } from "@/lib/auth/ownership";
import {
  applyTradeCashDelta,
  importCashDelta,
  portfolioTracksTradeCash,
  salePriceFor,
} from "@/lib/cash-trade";
import { classifyImportWrite } from "@/lib/classroom";
import { denyClassroomWrite } from "@/lib/classroom-guard";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { normalizeYahooTicker, resolveImportTicker } from "@/lib/ticker";
import { isRecord, readFiniteNumber, readString } from "@/lib/unknown";
import { observeRoute } from "@/lib/observe-route";
import { holdingsImportSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

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
async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured, use local demo store" },
      { status: 400 }
    );
  }

  const parsed = await parseJsonBody(req, holdingsImportSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const portfolioId = body.portfolio_id;
  if (!portfolioId) {
    return NextResponse.json({ error: "portfolio_id required" }, { status: 400 });
  }

  const notOwner = await requirePortfolioOwner(auth.user.id, portfolioId);
  if (notOwner) return notOwner;

  const rows: ImportRow[] = Array.isArray(body.holdings)
    ? body.holdings.flatMap((row) => {
        if (!isRecord(row)) return [];
        const ticker = readString(row.ticker) ?? "";
        const shares = readFiniteNumber(row.shares);
        const buy = readFiniteNumber(row.buy_price);
        if (!ticker || shares == null || buy == null) return [];
        return [
          {
            ticker,
            shares,
            buy_price: buy,
            target_call_pct: readFiniteNumber(row.target_call_pct),
            isin: readString(row.isin),
          },
        ];
      })
    : [];
  const cash =
    body.cash === null ? null : readFiniteNumber(body.cash) ?? null;
  if (rows.length === 0 && cash == null) {
    return NextResponse.json(
      { error: "cash or holdings required" },
      { status: 400 }
    );
  }

  const { data: existing, error: exErr } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .select("id, ticker, shares, buy_price, sort_order")
    .eq("portfolio_id", portfolioId);
  if (exErr) {
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }

  const replacing = body.replace !== false && rows.length > 0;
  const blocked = await denyClassroomWrite(supabase, {
    portfolioId,
    userId: auth.user.id,
    action: classifyImportWrite({
      cash: cash != null,
      replace: replacing,
      rows: rows.map((row) => ({
        ticker:
          resolveImportTicker(String(row.ticker ?? ""), row.isin) ||
          normalizeYahooTicker(String(row.ticker ?? "")),
        shares: Number(row.shares),
      })),
      existing: (existing ?? []).flatMap((h) => {
        if (!isRecord(h)) return [];
        const ticker = readString(h.ticker);
        const shares = readFiniteNumber(h.shares);
        if (!ticker || shares == null) return [];
        return [{ ticker, shares }];
      }),
    }),
  });
  if (blocked) return blocked;

  const paperCash = await portfolioTracksTradeCash(supabase, portfolioId);
  let cashUpdated = false;
  if (cash != null && Number.isFinite(cash)) {
    const nextCash = paperCash ? cash : Math.max(0, cash);
    const { error } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .update({
        cash_balance: nextCash,
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
        if (data) {
          byTicker.set(String(data.ticker).toUpperCase(), {
            id: data.id,
            ticker: data.ticker,
            shares,
            buy_price: buyPrice,
            sort_order: data.sort_order,
          });
        }
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

  let cashBalance: number | null = null;
  if (cashUpdated) {
    const { data: port } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .select("cash_balance")
      .eq("id", portfolioId)
      .maybeSingle();
    const n = Number((port as { cash_balance?: number } | null)?.cash_balance);
    cashBalance = Number.isFinite(n) ? n : null;
  } else {
    const accepted = rows
      .map((row) => {
        const ticker =
          resolveImportTicker(String(row.ticker ?? ""), row.isin) ||
          normalizeYahooTicker(String(row.ticker ?? ""));
        const shares = Number(row.shares);
        const buyPrice = Number(row.buy_price);
        if (
          !ticker ||
          !Number.isFinite(shares) ||
          shares <= 0 ||
          !Number.isFinite(buyPrice) ||
          !(buyPrice > 0)
        ) {
          return null;
        }
        return { ticker, shares, buy_price: buyPrice };
      })
      .filter((row): row is { ticker: string; shares: number; buy_price: number } =>
        Boolean(row)
      );
    const existingRows = ((existing ?? []) as {
      ticker: string;
      shares: number;
      buy_price: number;
    }[]).map((h) => ({
      ticker: String(h.ticker),
      shares: Number(h.shares),
      buy_price: Number(h.buy_price),
    }));
    const saleTickers = new Set<string>();
    for (const old of existingRows) {
      const key = old.ticker.toUpperCase();
      const nxt = accepted.find((r) => r.ticker.toUpperCase() === key);
      if (!nxt) {
        if (replacing) saleTickers.add(old.ticker);
      } else if (nxt.shares < old.shares) {
        saleTickers.add(old.ticker);
      }
    }
    const salePx: Record<string, number> = {};
    await Promise.all(
      [...saleTickers].map(async (ticker) => {
        const old = existingRows.find(
          (h) => h.ticker.toUpperCase() === ticker.toUpperCase()
        );
        salePx[ticker.toUpperCase()] = await salePriceFor(
          ticker,
          old?.buy_price ?? 0
        );
      })
    );
    if (paperCash) {
      const delta = importCashDelta(
        existingRows,
        accepted,
        replacing,
        salePx
      );
      cashBalance = await applyTradeCashDelta(supabase, portfolioId, delta);
      cashUpdated = delta !== 0;
    } else {
      const { data: port } = await supabase
        .from(PORTFELL_TABLES.portfolios)
        .select("cash_balance")
        .eq("id", portfolioId)
        .maybeSingle();
      const n = Number((port as { cash_balance?: number } | null)?.cash_balance);
      cashBalance = Number.isFinite(n) ? n : null;
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    cashUpdated,
    cash_balance: cashBalance,
    upserted,
    removed,
    failed,
    total: rows.length,
  });
}

export const POST = observeRoute(handlePOST, '/api/holdings/import');
