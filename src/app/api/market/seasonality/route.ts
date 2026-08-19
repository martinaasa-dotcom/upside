import { noStoreHeaders, publicCdnHeaders } from "@/lib/cdn-cache";
import { getSeasonalityModel } from "@/lib/market/seasonality-fetch";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { getAuthUser } from "@/lib/supabase/server-auth";

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
  // `force` skips the cache and goes straight to the upstream provider, so
  // only honour it for a signed-in caller. The Lab tab that sends it is
  // behind auth anyway; an anonymous scraper shouldn't be able to bypass
  // the cache at will and burn the free-tier quota.
  const forceAsked = req.nextUrl.searchParams.get("force") === "1";
  const force = forceAsked ? (await getAuthUser()) !== null : false;

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
