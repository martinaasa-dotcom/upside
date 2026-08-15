import {
  captureBookPayload,
  pruneOldSnapshots,
  restoreBookFromSnapshot,
  restoreSheetFromSnapshot,
  saveBookSnapshot,
} from "@/lib/book-snapshot";
import {
  listOwnedPortfolioIds,
  requirePortfolioOwner,
} from "@/lib/auth/ownership";
import { denyClassroomWrite } from "@/lib/classroom-guard";
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

  const owned = new Set(await listOwnedPortfolioIds(auth.user.id));
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.snapshots)
    .select("id, kind, label, created_at, payload")
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const snapshots = ((data ?? []) as {
    id: string;
    kind: string;
    label: string;
    created_at: string;
    payload?: { portfolios?: { id?: string }[] };
  }[])
    .filter((row) => {
      const ports = row.payload?.portfolios;
      if (!Array.isArray(ports)) return false;
      return ports.some((p) => p.id && owned.has(p.id));
    })
    .slice(0, 40)
    .map(({ id, kind, label, created_at }) => ({
      id,
      kind,
      label,
      created_at,
    }));
  return NextResponse.json({ snapshots });
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
          "Whole-book snapshot/restore needs SUPABASE_SERVICE_ROLE_KEY configured. Without it, a signed-in session only sees its own portfolios, so this would silently save/restore a partial book. Use restore_sheet for a single sheet instead.",
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
      const ownedIds = await listOwnedPortfolioIds(auth.user.id);
      if (ownedIds.length) {
        const { data: classSheets } = await supabase
          .from(PORTFELL_TABLES.portfolios)
          .select("id")
          .in("id", ownedIds)
          .not("classroom_community_id", "is", null);
        for (const sheet of (classSheets ?? []) as { id: string }[]) {
          const blocked = await denyClassroomWrite(supabase, {
            portfolioId: sheet.id,
            userId: auth.user.id,
            action: ["buy", "sell", "cash"],
          });
          if (blocked) return blocked;
        }
      }
      const safety = await captureBookPayload(supabase, {
        portfolioIds: ownedIds,
      });
      await saveBookSnapshot(supabase, "pre_delete", "Before restore", safety);
      const counts = await restoreBookFromSnapshot(
        supabase,
        snapshotId,
        ownedIds
      );
      return NextResponse.json({ ok: true, restored: counts });
    }

    if (body.action === "restore_sheet") {
      if (!snapshotId || !body.portfolioId) {
        return NextResponse.json(
          { error: "snapshotId and portfolioId required" },
          { status: 400 }
        );
      }
      const notOwner = await requirePortfolioOwner(
        auth.user.id,
        body.portfolioId
      );
      if (notOwner) return notOwner;
      const blocked = await denyClassroomWrite(supabase, {
        portfolioId: body.portfolioId,
        userId: auth.user.id,
        action: ["buy", "sell", "cash"],
      });
      if (blocked) return blocked;
      const safety = await captureBookPayload(supabase, {
        portfolioIds: [body.portfolioId],
      });
      await saveBookSnapshot(
        supabase,
        "pre_delete",
        "Before sheet restore",
        safety
      );
      const counts = await restoreSheetFromSnapshot(
        supabase,
        snapshotId,
        body.portfolioId
      );
      return NextResponse.json({ ok: true, restoredSheet: counts });
    }

    if (body.action === "create" || !body.action) {
      const ownedIds = await listOwnedPortfolioIds(auth.user.id);
      const payload = await captureBookPayload(supabase, {
        portfolioIds: ownedIds,
      });
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
