import { publicCdnHeaders } from "@/lib/cdn-cache";
import { fetchFxOnly, fetchQuotesWithFallback } from "@/lib/market/quotes";
import { marketSession } from "@/lib/market/session";
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
    { headers: publicCdnHeaders(cacheSeconds()) }
  );
}

export const GET = observeRoute(handleGET, '/api/quotes');
