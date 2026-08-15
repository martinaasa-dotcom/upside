import { requirePortfolioOwner } from "@/lib/auth/ownership";
import {
  applyPortfolioCashDelta,
  salePriceFor,
  tradeCashDelta,
} from "@/lib/cash-trade";
import { holdingWriteActions } from "@/lib/classroom";
import { denyClassroomWrite } from "@/lib/classroom-guard";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { isSafePositiveMoney, isSafeShares } from "@/lib/input-guard";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { isPlausibleTicker, normalizeYahooTicker } from "@/lib/ticker";
import { roundMoney, roundShares } from "@/lib/money";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type HoldingRow = {
  portfolio_id: string;
  shares: number;
  ticker: string;
  buy_price: number;
};

/**
 * Load the holding a write is aimed at, or the response explaining why not.
 *
 * Authorization for a row-level write has to come from the stored row, never
 * from the request body. This used to read the row and then fall back to
 * `body.portfolio_id` when the read came back empty, while the read's error
 * was discarded — so a failed lookup (timeout, transient error) turned into
 * "authorize against whatever portfolio the caller named". Since
 * getSupabaseDataClient() is the service-role client in production, RLS is
 * not there to catch it: these checks are the only thing standing between a
 * caller and another tenant's row.
 *
 * Fails closed on every path: a lookup error is a 503, a missing row is a
 * 404, and the portfolio id used for the ownership check is always the one
 * persisted on the row.
 */
async function loadWritableHolding(
  supabase: SupabaseClient,
  userId: string,
  holdingId: string
): Promise<{ row: HoldingRow; portfolioId: string } | { error: NextResponse }> {
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .select("portfolio_id, shares, ticker, buy_price")
    .eq("id", holdingId)
    .maybeSingle();

  if (error) {
    return {
      error: NextResponse.json(
        { error: "Couldn't check that holding. Try again." },
        { status: 503 }
      ),
    };
  }
  if (!data) {
    return {
      error: NextResponse.json({ error: "Holding not found" }, { status: 404 }),
    };
  }

  const row = data as HoldingRow;
  const notOwner = await requirePortfolioOwner(userId, row.portfolio_id);
  if (notOwner) return { error: notOwner };

  return { row, portfolioId: row.portfolio_id };
}

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

  if (!isPlausibleTicker(ticker)) {
    return NextResponse.json(
      { error: "That ticker doesn't look like a real symbol." },
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
  if (!isSafeShares(shares)) {
    return NextResponse.json({ error: "Shares must be a positive number" }, { status: 400 });
  }
  if (!isSafePositiveMoney(buyPrice)) {
    return NextResponse.json({ error: "Buy price must be a positive number" }, { status: 400 });
  }

  const { data: existingRow } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .select("shares, buy_price")
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

  const prevShares = existingRow
    ? Number((existingRow as { shares: number }).shares)
    : 0;
  const prevBuy = existingRow
    ? Number((existingRow as { buy_price: number }).buy_price)
    : 0;
  let delta = 0;
  if (!existingRow) {
    delta = tradeCashDelta({ buyShares: shares, buyPrice });
  } else if (shares > prevShares) {
    delta = tradeCashDelta({
      buyShares: shares - prevShares,
      buyPrice,
    });
  } else if (shares < prevShares) {
    const px = await salePriceFor(ticker, prevBuy || buyPrice);
    delta = tradeCashDelta({
      sellShares: prevShares - shares,
      sellPrice: px,
    });
  }
  const cash = await applyPortfolioCashDelta(supabase, portfolioId, delta);
  return NextResponse.json({ holding: data, cash_balance: cash });
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

  const loaded = await loadWritableHolding(supabase, auth.user.id, id);
  if ("error" in loaded) return loaded.error;
  const { row: existing, portfolioId } = loaded;

  const patch: TablesUpdate<"portfell_holdings"> = {
    updated_at: new Date().toISOString(),
  };
  if (body.ticker !== undefined) {
    const t = normalizeYahooTicker(String(body.ticker));
    if (!isPlausibleTicker(t)) {
      return NextResponse.json(
        { error: "That ticker doesn't look like a real symbol." },
        { status: 400 }
      );
    }
    patch.ticker = t;
  }
  if (body.eoy_target === null) patch.eoy_target = null;
  if (body.stock_target_override === null) patch.stock_target_override = null;
  if (body.shares !== undefined) {
    const n = roundShares(Number(body.shares));
    if (!isSafeShares(n)) {
      return NextResponse.json(
        { error: "Shares must be a positive number" },
        { status: 400 }
      );
    }
    patch.shares = n;
  }
  if (body.buy_price !== undefined) {
    const n = roundMoney(Number(body.buy_price));
    if (!isSafePositiveMoney(n)) {
      return NextResponse.json(
        { error: "Buy price must be a positive number" },
        { status: 400 }
      );
    }
    patch.buy_price = n;
  }
  if (body.eoy_target !== undefined && body.eoy_target !== null) {
    patch.eoy_target = Number(body.eoy_target);
  }
  if (
    body.stock_target_override !== undefined &&
    body.stock_target_override !== null
  ) {
    patch.stock_target_override = Number(body.stock_target_override);
  }
  if (body.target_call_pct !== undefined) {
    patch.target_call_pct = Number(body.target_call_pct);
  }
  if (body.sort_order !== undefined) {
    patch.sort_order = Number(body.sort_order);
  }

  const prevShares = Number(existing.shares) || 0;
  const prevBuy = Number(existing.buy_price) || 0;
  const prevTicker = String(existing.ticker ?? "");
  const nextShares =
    body.shares !== undefined ? roundShares(Number(body.shares)) : prevShares;
  const nextBuy =
    body.buy_price !== undefined ? roundMoney(Number(body.buy_price)) : prevBuy;
  const nextTicker =
    body.ticker !== undefined
      ? normalizeYahooTicker(String(body.ticker))
      : prevTicker;
  const renamed =
    Boolean(prevTicker) &&
    Boolean(nextTicker) &&
    prevTicker.toUpperCase() !== nextTicker.toUpperCase();

  const blocked = await denyClassroomWrite(supabase, {
    portfolioId,
    userId: auth.user.id,
    action: holdingWriteActions({
      isNew: false,
      isDelete: false,
      existingShares: prevShares,
      nextShares,
      tickerChanged: renamed,
    }),
  });
  if (blocked) return blocked;

  // Scoped to the portfolio the ownership check just cleared, not only to the
  // row id. Authorization and mutation then describe the same rows, so the
  // window between the two reads can't be used to retarget the write.
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .update(patch)
    .eq("id", id)
    .eq("portfolio_id", portfolioId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let delta = 0;
  if (renamed) {
    const sellPx = await salePriceFor(prevTicker, prevBuy);
    delta += tradeCashDelta({ sellShares: prevShares, sellPrice: sellPx });
    delta += tradeCashDelta({
      buyShares: nextShares,
      buyPrice: nextBuy || prevBuy,
    });
  } else if (nextShares > prevShares) {
    delta = tradeCashDelta({
      buyShares: nextShares - prevShares,
      buyPrice: nextBuy || prevBuy,
    });
  } else if (nextShares < prevShares) {
    const px = await salePriceFor(prevTicker, prevBuy);
    delta = tradeCashDelta({
      sellShares: prevShares - nextShares,
      sellPrice: px,
    });
  }
  const cash = await applyPortfolioCashDelta(supabase, portfolioId, delta);
  return NextResponse.json({ holding: data, cash_balance: cash });
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

  const loaded = await loadWritableHolding(supabase, auth.user.id, id);
  if ("error" in loaded) return loaded.error;
  const { row: existing, portfolioId } = loaded;

  const blocked = await denyClassroomWrite(supabase, {
    portfolioId,
    userId: auth.user.id,
    action: "sell",
  });
  if (blocked) return blocked;

  const { error } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .delete()
    .eq("id", id)
    .eq("portfolio_id", portfolioId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const shares = Number(existing.shares) || 0;
  const buy = Number(existing.buy_price) || 0;
  const ticker = String(existing.ticker ?? "");
  const px = ticker ? await salePriceFor(ticker, buy) : buy;
  const cash = await applyPortfolioCashDelta(
    supabase,
    portfolioId,
    tradeCashDelta({ sellShares: shares, sellPrice: px })
  );
  return NextResponse.json({ ok: true, cash_balance: cash });
}
