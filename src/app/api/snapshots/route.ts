import {
  captureBookPayload,
  pruneOldSnapshots,
  restoreBookFromSnapshot,
  restoreSheetFromSnapshot,
  saveBookSnapshot,
} from "@/lib/book-snapshot";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import {
  getSupabaseDataClient,
  supabaseUsesServiceRole,
} from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** List recent snapshots (metadata only). */
export async function GET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
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

/** Create a manual snapshot, or restore one. */
export async function POST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    snapshotId?: string;
    id?: string;
    portfolioId?: string;
    label?: string;
  };

  const snapshotId = body.snapshotId ?? body.id;

  // "create" / "restore" cover the WHOLE book across every user, not just
  // the caller's own portfolios — under the caller's own session, RLS only
  // exposes portfolios they can see, so a full-book capture/restore here
  // would silently be partial rather than a real backup. Require service
  // role for those two; "restore_sheet" only ever touches the caller's own
  // sheet, which their session already has legitimate rights to.
  const wholeBookAction = body.action === "restore" || body.action === "create" || !body.action;
  if (wholeBookAction && !supabaseUsesServiceRole()) {
    return NextResponse.json(
      {
        error:
          "Whole-book snapshot/restore needs SUPABASE_SERVICE_ROLE_KEY configured — without it, a signed-in session only sees its own portfolios, so this would silently save/restore a partial book. Use restore_sheet for a single sheet instead.",
      },
      { status: 503 }
    );
  }

  try {
    if (body.action === "restore") {
      if (!snapshotId) {
        return NextResponse.json(
          { error: "snapshotId required" },
          { status: 400 }
        );
      }
      await saveBookSnapshot(supabase, "pre_delete", "Before restore");
      const counts = await restoreBookFromSnapshot(supabase, snapshotId);
      return NextResponse.json({ ok: true, restored: counts });
    }

    if (body.action === "restore_sheet") {
      if (!snapshotId || !body.portfolioId) {
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
        snapshotId,
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
