import { requireAuthUser } from "@/lib/supabase/server-auth";
import { fetchTrendsBatch, MAX_TICKERS } from "@/lib/market/trends-cache";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as {
    tickers?: unknown;
    force?: boolean;
  };
  const requested = Array.isArray(body.tickers)
    ? body.tickers
        .filter((t): t is string => typeof t === "string" && !!t.trim())
        .map((t) => t.trim().toUpperCase())
    : [];

  const unique = [...new Set(requested)].slice(0, MAX_TICKERS);
  if (unique.length === 0) {
    return NextResponse.json({ rows: [], benchmark: null });
  }

  const result = await fetchTrendsBatch(unique, { force: Boolean(body.force) });

  const headers = new Headers();
  headers.set(
    "Cache-Control",
    "private, s-maxage=300, stale-while-revalidate=3600"
  );
  headers.set(
    "x-trends-cache-hit-ratio",
    `${result.cachedCount}/${unique.length}`
  );

  return NextResponse.json(
    {
      rows: result.rows,
      benchmark: result.benchmark,
      asOf: result.asOf,
      cachedCount: result.cachedCount,
    },
    { headers }
  );
}
