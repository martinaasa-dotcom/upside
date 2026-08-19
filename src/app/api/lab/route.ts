import { NextRequest, NextResponse } from "next/server";
import {
  emptyLabBundle,
  sanitizeWatchlist,
  type LabBundle,
} from "@/lib/lab-bundle";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { observeRoute } from "@/lib/observe-route";
import { labPutSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

const LAB_COLS = "id, owner_id, conviction, watchlist, updated_at";

function rowToBundle(row: Record<string, unknown> | null): LabBundle {
  if (!row) return emptyLabBundle();
  return {
    conviction: (row.conviction as LabBundle["conviction"]) ?? {},
    watchlist: sanitizeWatchlist(row.watchlist),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

async function handleGET() {
  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({
      source: "local",
      bundle: emptyLabBundle(),
    });
  }

  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.labState)
    .select(LAB_COLS)
    .eq("owner_id", auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    source: "supabase",
    bundle: rowToBundle(data),
  });
}

async function handlePUT(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured, Lab stays local" },
      { status: 400 }
    );
  }

  const parsed = await parseJsonBody(req, labPutSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from(PORTFELL_TABLES.labState)
    .select("id")
    .eq("owner_id", auth.user.id)
    .maybeSingle();

  // A partial save. The watchlist and the conviction notes are written by
  // different screens, so only touch the fields this request actually sent
  // — otherwise a watchlist-only save would blank someone's thesis notes.
  const patch: {
    updated_at: string;
    conviction?: LabBundle["conviction"];
    watchlist?: string[];
  } = { updated_at: now };
  if (body.conviction !== undefined) {
    patch.conviction = body.conviction as LabBundle["conviction"];
  }
  if (body.watchlist !== undefined) {
    patch.watchlist = sanitizeWatchlist(body.watchlist);
  }

  let data: Record<string, unknown> | null = null;
  let error: { message: string } | null = null;

  if (existing) {
    const updated = await supabase
      .from(PORTFELL_TABLES.labState)
      .update(patch)
      .eq("owner_id", auth.user.id)
      .select(LAB_COLS)
      .single();
    data = updated.data as Record<string, unknown> | null;
    error = updated.error;
  } else {
    const inserted = await supabase
      .from(PORTFELL_TABLES.labState)
      .insert({
        id: auth.user.id,
        owner_id: auth.user.id,
        conviction: (body.conviction ?? {}) as LabBundle["conviction"],
        watchlist: sanitizeWatchlist(body.watchlist),
        updated_at: now,
      })
      .select(LAB_COLS)
      .single();
    data = inserted.data as Record<string, unknown> | null;
    error = inserted.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    bundle: rowToBundle(data),
  });
}

export const GET = observeRoute(handleGET, '/api/lab');
export const PUT = observeRoute(handlePUT, '/api/lab');
