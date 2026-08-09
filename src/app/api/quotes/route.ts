import { fetchQuotes } from "@/lib/market/yahoo";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tickersParam = req.nextUrl.searchParams.get("tickers") ?? "";
  const tickers = tickersParam
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  if (tickers.length === 0) {
    return NextResponse.json({
      quotes: {},
      delayed: false,
      updatedAt: new Date().toISOString(),
    });
  }

  const { quotes, delayed } = await fetchQuotes(tickers);
  return NextResponse.json(
    {
      quotes,
      delayed,
      updatedAt: new Date().toISOString(),
    },
    {
      headers: { "Cache-Control": "s-maxage=15, stale-while-revalidate=30" },
    }
  );
}
