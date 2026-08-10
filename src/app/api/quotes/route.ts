import { fetchFxOnly, fetchQuotes } from "@/lib/market/yahoo";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      {
        headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" },
      }
    );
  }

  const { quotes, delayed, fx } = await fetchQuotes(tickers);
  return NextResponse.json(
    {
      quotes,
      fx,
      delayed,
      updatedAt: new Date().toISOString(),
    },
    {
      headers: { "Cache-Control": "s-maxage=15, stale-while-revalidate=30" },
    }
  );
}
