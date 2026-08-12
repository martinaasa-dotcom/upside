import { buildSeasonalityModel } from "@/lib/market/seasonality";
import { fetchSeasonalityBars } from "@/lib/market/seasonality-fetch";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get("ticker") ?? "SPY")
    .trim()
    .toUpperCase();
  if (!ticker || ticker.length > 12) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  try {
    const { daily } = await fetchSeasonalityBars(ticker);
    if (daily.length < 50) {
      return NextResponse.json(
        { error: "Not enough history for seasonality" },
        { status: 502 }
      );
    }
    const model = buildSeasonalityModel({ ticker, daily });
    return NextResponse.json(model, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=7200" },
    });
  } catch (err) {
    console.error("seasonality fetch failed", err);
    return NextResponse.json(
      { error: "Seasonality data unavailable" },
      { status: 502 }
    );
  }
}
