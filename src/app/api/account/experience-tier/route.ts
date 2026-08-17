import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { readJsonBody } from "@/lib/http";
import { isRecord } from "@/lib/unknown";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
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

export async function POST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const raw = await readJsonBody(req);
  const body = isRecord(raw) ? raw : {};
  const tierRaw = body.tier;
  const knowsOptionsRaw = body.knowsOptions;
  if (knowsOptionsRaw !== undefined && typeof knowsOptionsRaw !== "boolean") {
    return NextResponse.json({ error: "Invalid knowsOptions" }, { status: 400 });
  }
  const knowsOptions = knowsOptionsRaw;
  if (
    tierRaw !== undefined &&
    tierRaw !== "novice" &&
    tierRaw !== "investor" &&
    tierRaw !== "advanced"
  ) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }
  const tier =
    tierRaw === "novice" || tierRaw === "investor" || tierRaw === "advanced"
      ? tierRaw
      : undefined;
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
