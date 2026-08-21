import { noStoreHeaders, publicCdnHeaders } from "@/lib/cdn-cache";
import {
  MAX_TICKERS_PER_REQUEST,
  fetchFxOnly,
  fetchQuotesWithFallback,
} from "@/lib/market/quotes";
import { marketSession } from "@/lib/market/session";
import {
  chargeUnresolvedBudget,
  checkUnresolvedBudget,
} from "@/lib/market/unresolved-budget";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const runtime = "nodejs";

/**
 * How long the CDN may reuse a quote response. Browsers always revalidate
 * (max-age=0) so a tab that opened overnight cannot keep serving a
 * flattened close after pre-market starts. Vercel-CDN-Cache-Control is set
 * too: Next otherwise stamps dynamic route handlers with no-store and the
 * s-maxage never reaches the edge.
 */
function cacheSeconds(): number {
  switch (marketSession()) {
    case "open":
    case "extended":
      return 15;
    case "closed":
      return 60;
  }
}

async function handleGET(req: NextRequest) {
  const tickersParam = req.nextUrl.searchParams.get("tickers") ?? "";
  const tickers = tickersParam
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  // FX-only: Compound / empty books still need EURUSD open·close·last
  if (
    tickers.length === 0 ||
    (tickers.length === 1 && tickers[0] === "EURUSD=X")
  ) {
    const fx = await fetchFxOnly();
    return NextResponse.json(
      {
        quotes: {},
        fx,
        delayed: false,
        updatedAt: new Date().toISOString(),
      },
      { headers: publicCdnHeaders(Math.max(60, cacheSeconds())) }
    );
  }

  // One request may not be turned into an unbounded upstream fan-out. See
  // MAX_TICKERS_PER_REQUEST -- the per-IP limiter counts requests, not the
  // provider calls a single request can cause.
  if (tickers.length > MAX_TICKERS_PER_REQUEST) {
    return NextResponse.json(
      {
        error: `Too many tickers in one request. Ask for at most ${MAX_TICKERS_PER_REQUEST}.`,
      },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  // Looking up names that resolve nowhere is the expensive thing this
  // endpoint does, and an address that has spent its share of it is refused
  // before any provider is contacted. Real books never reach this.
  const budget = checkUnresolvedBudget(req);
  if (!budget.ok) {
    return NextResponse.json(
      { error: "Too many unknown tickers. Try again shortly." },
      {
        status: 429,
        headers: {
          ...noStoreHeaders(),
          "Retry-After": String(budget.retryAfterSec ?? 60),
        },
      }
    );
  }

  const { quotes, delayed, fx, sources, missing, newlyUnresolvable, updatedAt } =
    await fetchQuotesWithFallback(tickers);

  // Billed after the fact, against work actually done. A repeat ask for a
  // ticker already known to be dead costs nothing here, because it cost
  // nothing upstream.
  await chargeUnresolvedBudget(req, newlyUnresolvable);

  return NextResponse.json(
    {
      quotes,
      fx,
      delayed,
      sources,
      missing,
      updatedAt: new Date(updatedAt).toISOString(),
    },
    { headers: publicCdnHeaders(cacheSeconds()) }
  );
}

export const GET = observeRoute(handleGET, '/api/quotes');
