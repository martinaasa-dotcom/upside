import { noteEmailConfigured } from "@/lib/send-note";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { readJsonBody } from "@/lib/http";
import { isRecord } from "@/lib/unknown";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function asBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

export async function GET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;
  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({
      morning: false,
      sunday: false,
      enabled: false,
      canSend: noteEmailConfigured(),
    });
  }
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("note_morning, note_sunday, morning_note")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const morning = Boolean(data?.note_morning ?? data?.morning_note);
  const sunday = Boolean(data?.note_sunday ?? data?.morning_note);
  return NextResponse.json({
    morning,
    sunday,
    enabled: morning || sunday,
    canSend: noteEmailConfigured(),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;
  const raw = await readJsonBody(req);
  const body = isRecord(raw) ? raw : {};
  const enabled = asBool(body?.enabled);
  let morning = asBool(body?.morning);
  let sunday = asBool(body?.sunday);
  if (enabled !== undefined && morning === undefined && sunday === undefined) {
    morning = enabled;
    sunday = enabled;
  }
  if (morning === undefined && sunday === undefined) {
    return NextResponse.json(
      { error: "morning or sunday required" },
      { status: 400 }
    );
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }
  const { data: current } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("note_morning, note_sunday")
    .eq("id", auth.user.id)
    .maybeSingle();
  const nextMorning = morning ?? Boolean(current?.note_morning);
  const nextSunday = sunday ?? Boolean(current?.note_sunday);
  const { error } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .update({
      note_morning: nextMorning,
      note_sunday: nextSunday,
      morning_note: nextMorning || nextSunday,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    morning: nextMorning,
    sunday: nextSunday,
    enabled: nextMorning || nextSunday,
    canSend: noteEmailConfigured(),
  });
}
