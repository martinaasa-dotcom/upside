import { fetchFearGreedIndex } from "@/lib/market/fear-greed";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
