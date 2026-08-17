import { loadPopularTickers } from "@/lib/popular-tickers-store";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const supabase = supabaseUsesServiceRole() ? getSupabaseServer() : null;
  const payload = await loadPopularTickers(supabase);
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control":
        "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

export const GET = observeRoute(handleGET, '/api/popular-tickers');
