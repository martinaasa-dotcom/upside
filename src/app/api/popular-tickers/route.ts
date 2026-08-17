import { publicCdnHeaders } from "@/lib/cdn-cache";
import { loadStoredPopularTickers } from "@/lib/popular-tickers-read";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

async function handleGET() {
  const supabase = supabaseUsesServiceRole() ? getSupabaseServer() : null;
  const payload = await loadStoredPopularTickers(supabase);
  return NextResponse.json(payload, {
    headers: publicCdnHeaders(3600, 86400),
  });
}

export const GET = observeRoute(handleGET, "/api/popular-tickers");
