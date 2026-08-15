import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;
  const supabase = await getSupabaseDataClient();
  if (!supabase) return NextResponse.json({ enabled: false });
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("morning_note")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ enabled: Boolean(data?.morning_note) });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled required" }, { status: 400 });
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }
  const { error } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .update({
      morning_note: body.enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, enabled: body.enabled });
}
