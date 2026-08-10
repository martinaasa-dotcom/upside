import {
  captureBookPayload,
  pruneOldSnapshots,
  restoreBookFromSnapshot,
  restoreSheetFromSnapshot,
  saveBookSnapshot,
} from "@/lib/book-snapshot";
import { requireOwnerPin } from "@/lib/owner-pin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** List recent snapshots (metadata only). Requires owner PIN. */
export async function GET(req: NextRequest) {
  const denied = requireOwnerPin(req);
  if (denied) return denied;

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.snapshots)
    .select("id, kind, label, created_at")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ snapshots: data ?? [] });
}

/** Create a manual snapshot, or restore one. Requires owner PIN. */
export async function POST(req: NextRequest) {
  const denied = requireOwnerPin(req);
  if (denied) return denied;

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    snapshotId?: string;
    portfolioId?: string;
    label?: string;
  };

  try {
    if (body.action === "restore") {
      if (!body.snapshotId) {
        return NextResponse.json(
          { error: "snapshotId required" },
          { status: 400 }
        );
      }
      await saveBookSnapshot(supabase, "pre_delete", "Before restore");
      const counts = await restoreBookFromSnapshot(supabase, body.snapshotId);
      return NextResponse.json({ ok: true, restored: counts });
    }

    if (body.action === "restore_sheet") {
      if (!body.snapshotId || !body.portfolioId) {
        return NextResponse.json(
          { error: "snapshotId and portfolioId required" },
          { status: 400 }
        );
      }
      await saveBookSnapshot(
        supabase,
        "pre_delete",
        "Before sheet restore"
      );
      const counts = await restoreSheetFromSnapshot(
        supabase,
        body.snapshotId,
        body.portfolioId
      );
      return NextResponse.json({ ok: true, restoredSheet: counts });
    }

    if (body.action === "create" || !body.action) {
      const payload = await captureBookPayload(supabase);
      const snap = await saveBookSnapshot(
        supabase,
        "manual",
        body.label?.trim() || "Manual snapshot",
        payload
      );
      await pruneOldSnapshots(supabase);
      return NextResponse.json({ snapshot: snap });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Snapshot failed" },
      { status: 500 }
    );
  }
}
