import { attachEarningsBriefs } from "@/lib/earnings-brief";
import { fetchMarketEvents } from "@/lib/market/yahoo";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function handleGET(req: NextRequest) {
  const tickersParam = req.nextUrl.searchParams.get("tickers") ?? "";
  const tickers = tickersParam
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  if (tickers.length === 0) {
    return NextResponse.json({ earnings: [], catalysts: [] });
  }

  const events = await fetchMarketEvents(tickers);
  const withBriefs =
    req.nextUrl.searchParams.get("brief") === "1"
      ? { ...events, earnings: await attachEarningsBriefs(events.earnings) }
      : events;
  return NextResponse.json(withBriefs, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=7200" },
  });
}

export const GET = observeRoute(handleGET, '/api/market/events');
