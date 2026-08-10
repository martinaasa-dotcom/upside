import { NextRequest, NextResponse } from "next/server";
import { emptyLabBundle, type LabBundle } from "@/lib/lab-bundle";
import { requireOwnerPin } from "@/lib/owner-pin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { defaultArena } from "@/lib/paper-arena";

export const dynamic = "force-dynamic";

function rowToBundle(row: Record<string, unknown> | null): LabBundle {
  if (!row) return emptyLabBundle();
  return {
    conviction: (row.conviction as LabBundle["conviction"]) ?? {},
    journal: Array.isArray(row.journal) ? row.journal : [],
    cashflows: Array.isArray(row.cashflows) ? row.cashflows : [],
    arena:
      row.arena && typeof row.arena === "object"
        ? { ...defaultArena(), ...(row.arena as object) }
        : defaultArena(),
    badges: Array.isArray(row.badges) ? row.badges : [],
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

export async function GET() {
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({
      source: "local",
      bundle: emptyLabBundle(),
    });
  }

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.labState)
    .select("*")
    .eq("id", "book")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    source: "supabase",
    bundle: rowToBundle(data),
  });
}

export async function PUT(req: NextRequest) {
  const denied = requireOwnerPin(req);
  if (denied) return denied;

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured — Lab stays local" },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Partial<LabBundle>;
  const payload = {
    id: "book",
    conviction: body.conviction ?? {},
    journal: body.journal ?? [],
    cashflows: body.cashflows ?? [],
    arena: body.arena ?? defaultArena(),
    badges: body.badges ?? [],
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.labState)
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    bundle: rowToBundle(data),
  });
}
