import { fetchFxOnly, fetchQuotesWithFallback } from "@/lib/market/quotes";
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
        headers: {
          "Cache-Control":
            "public, max-age=60, s-maxage=60, stale-while-revalidate=120",
        },
      }
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
    {
      headers: {
        "Cache-Control":
          "public, max-age=15, s-maxage=15, stale-while-revalidate=30",
      },
    }
  );
}
