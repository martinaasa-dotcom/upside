import { requireAuthUser } from "@/lib/supabase/server-auth";
import { fetchTrendsBatch, MAX_TICKERS } from "@/lib/market/trends-cache";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { trendsPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const parsed = await parseJsonBody(req, trendsPostSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
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
  // Auth cookies keep this off the public CDN. The payload itself is
  // shared per ticker in trends-cache (Next data cache), so the second
  // person to ask for $NBIS does not hit Yahoo again.
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

export const POST = observeRoute(handlePOST, '/api/trends');
