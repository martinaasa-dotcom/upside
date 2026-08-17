import { TICKER_QUERY_MAX } from "@/lib/input-guard";
import { searchYahooTickers } from "@/lib/market/ticker-search-yahoo";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CDN =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";

async function handleGET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1 || q.length > TICKER_QUERY_MAX) {
    return NextResponse.json({ results: [] });
  }

  const results = await searchYahooTickers(q);
  return NextResponse.json(
    { results },
    {
      headers: {
        "Cache-Control": CDN,
        "CDN-Cache-Control": CDN,
        "Vercel-CDN-Cache-Control": CDN,
      },
    }
  );
}

export const GET = observeRoute(handleGET, '/api/market/search');
