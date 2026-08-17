import { noStoreHeaders, publicCdnHeaders } from "@/lib/cdn-cache";
import { getSeasonalityModel } from "@/lib/market/seasonality-fetch";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const runtime = "nodejs";

async function handleGET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get("ticker") ?? "SPY")
    .trim()
    .toUpperCase();
  if (!ticker || ticker.length > 12) {
    return NextResponse.json(
      { error: "Invalid ticker" },
      { status: 400, headers: noStoreHeaders() }
    );
  }
  const force = req.nextUrl.searchParams.get("force") === "1";

  try {
    const model = await getSeasonalityModel(ticker, { force });
    if (!model) {
      return NextResponse.json(
        { error: "Not enough history for seasonality" },
        { status: 502, headers: noStoreHeaders() }
      );
    }
    return NextResponse.json(model, {
      headers: publicCdnHeaders(3600, 21600),
    });
  } catch (err) {
    console.error("seasonality fetch failed", err);
    return NextResponse.json(
      { error: "Seasonality data unavailable" },
      { status: 502, headers: noStoreHeaders() }
    );
  }
}

export const GET = observeRoute(handleGET, '/api/market/seasonality');
