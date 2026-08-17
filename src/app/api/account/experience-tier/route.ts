import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { experienceTierPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

async function handleGET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ tier: null });
  }

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("experience_tier, knows_options")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    tier: data?.experience_tier ?? null,
    knowsOptions: data?.knows_options ?? null,
  });
}

async function handlePOST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const parsed = await parseJsonBody(req, experienceTierPostSchema);
  if (!parsed.ok) return parsed.response;
  const { tier, knowsOptions } = parsed.data;
  if (tier === undefined && knowsOptions === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const patch: TablesUpdate<"portfell_profiles"> = {
    updated_at: new Date().toISOString(),
  };
  if (tier !== undefined) patch.experience_tier = tier;
  if (knowsOptions !== undefined) patch.knows_options = knowsOptions;

  const { error } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .update(patch)
    .eq("id", auth.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tier, knowsOptions });
}

export const GET = observeRoute(handleGET, '/api/account/experience-tier');
export const POST = observeRoute(handlePOST, '/api/account/experience-tier');
