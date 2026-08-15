import { getSeasonalityModel } from "@/lib/market/seasonality-fetch";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const CDN =
  "public, max-age=0, s-maxage=3600, stale-while-revalidate=21600";

export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get("ticker") ?? "SPY")
    .trim()
    .toUpperCase();
  if (!ticker || ticker.length > 12) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }
  const force = req.nextUrl.searchParams.get("force") === "1";

  try {
    const model = await getSeasonalityModel(ticker, { force });
    if (!model) {
      return NextResponse.json(
        { error: "Not enough history for seasonality" },
        { status: 502 }
      );
    }
    return NextResponse.json(model, {
      headers: {
        "Cache-Control": CDN,
        "CDN-Cache-Control": CDN,
        "Vercel-CDN-Cache-Control": CDN,
      },
    });
  } catch (err) {
    console.error("seasonality fetch failed", err);
    return NextResponse.json(
      { error: "Seasonality data unavailable" },
      { status: 502 }
    );
  }
}
