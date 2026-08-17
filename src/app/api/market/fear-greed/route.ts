import { noStoreHeaders, publicCdnHeaders } from "@/lib/cdn-cache";
import { fetchFearGreedIndex } from "@/lib/market/fear-greed-fetch";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

async function handleGET() {
  const snapshot = await fetchFearGreedIndex();
  if (!snapshot) {
    return NextResponse.json(
      { error: "Fear & Greed index unavailable" },
      { status: 502, headers: noStoreHeaders() }
    );
  }
  return NextResponse.json(snapshot, {
    headers: publicCdnHeaders(900, 1800),
  });
}

export const GET = observeRoute(handleGET, "/api/market/fear-greed");
