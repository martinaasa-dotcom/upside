import { publicCdnHeaders } from "@/lib/cdn-cache";
import { TICKER_QUERY_MAX } from "@/lib/input-guard";
import { searchYahooTickers } from "@/lib/market/ticker-search-yahoo";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const runtime = "nodejs";

async function handleGET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1 || q.length > TICKER_QUERY_MAX) {
    return NextResponse.json({ results: [] }, { headers: publicCdnHeaders(300, 3600) });
  }

  const results = await searchYahooTickers(q);
  return NextResponse.json({ results }, { headers: publicCdnHeaders(300, 3600) });
}

export const GET = observeRoute(handleGET, '/api/market/search');
