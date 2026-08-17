import { fetchFearGreedIndex } from "@/lib/market/fear-greed";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const snapshot = await fetchFearGreedIndex();
  if (!snapshot) {
    return NextResponse.json(
      { error: "Fear & Greed index unavailable" },
      { status: 502 }
    );
  }
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=1800" },
  });
}

export const GET = observeRoute(handleGET, '/api/market/fear-greed');
