import { fetchFxOnly, fetchQuotesWithFallback } from "@/lib/market/quotes";
import { marketSession } from "@/lib/market/session";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How long a quote response may be reused. Prices only move while New York is
 * open, so a 15-second window out of hours just means every tab in the world
 * takes its own turn through the free-tier provider chain to be told the same
 * close. Widening it after the bell is the cheapest protection that chain has.
 */
function cacheSeconds(): number {
  switch (marketSession()) {
    case "open":
      return 15;
    case "extended":
      return 60;
    case "closed":
      return 300;
  }
}

function cacheHeaders(seconds: number) {
  return {
    "Cache-Control": `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}`,
  };
}

export async function GET(req: NextRequest) {
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
      { headers: cacheHeaders(Math.max(60, cacheSeconds())) }
    );
  }

  const { quotes, delayed, fx, sources, missing } =
    await fetchQuotesWithFallback(tickers);
  return NextResponse.json(
    {
      quotes,
      fx,
      delayed,
      sources,
      missing,
      updatedAt: new Date().toISOString(),
    },
    { headers: cacheHeaders(cacheSeconds()) }
  );
}
