import type { SupabaseClient } from "@supabase/supabase-js";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export type BookSnapshotKind = "nightly" | "pre_delete" | "manual";

export type BookSnapshotPayload = {
  portfolios: unknown[];
  holdings: unknown[];
};

export type BookSnapshotRow = {
  id: string;
  kind: BookSnapshotKind;
  label: string;
  payload: BookSnapshotPayload;
  created_at: string;
};

const KEEP_NIGHTLY = 14;
const KEEP_PRE_DELETE = 30;

export async function captureBookPayload(
  supabase: SupabaseClient
): Promise<BookSnapshotPayload> {
  const [{ data: portfolios, error: pErr }, { data: holdings, error: hErr }] =
    await Promise.all([
      supabase
        .from(PORTFELL_TABLES.portfolios)
        .select("*")
        .order("sort_order"),
      supabase.from(PORTFELL_TABLES.holdings).select("*").order("sort_order"),
    ]);
  if (pErr) throw new Error(pErr.message);
  if (hErr) throw new Error(hErr.message);
  return {
    portfolios: portfolios ?? [],
    holdings: holdings ?? [],
  };
}

export async function saveBookSnapshot(
  supabase: SupabaseClient,
  kind: BookSnapshotKind,
  label: string,
  payload?: BookSnapshotPayload
): Promise<BookSnapshotRow> {
  const body = payload ?? (await captureBookPayload(supabase));
  const { data, error } = await supabase
    .from(PORTFELL_TABLES.snapshots)
    .insert({
      kind,
      label,
      payload: body,
    })
    .select("id, kind, label, payload, created_at")
    .single();
  if (error) throw new Error(error.message);
  return data as BookSnapshotRow;
}

export async function pruneOldSnapshots(supabase: SupabaseClient) {
  const { data: nightly } = await supabase
    .from(PORTFELL_TABLES.snapshots)
    .select("id")
    .eq("kind", "nightly")
    .order("created_at", { ascending: false });
  const { data: preDelete } = await supabase
    .from(PORTFELL_TABLES.snapshots)
    .select("id")
    .eq("kind", "pre_delete")
    .order("created_at", { ascending: false });

  const dropIds = [
    ...(nightly ?? []).slice(KEEP_NIGHTLY).map((r) => r.id as string),
    ...(preDelete ?? []).slice(KEEP_PRE_DELETE).map((r) => r.id as string),
  ];
  if (dropIds.length === 0) return;
  await supabase.from(PORTFELL_TABLES.snapshots).delete().in("id", dropIds);
}

/**
 * Replace live book with snapshot payload.
 * Inserts portfolios first (preserving ids when present), then holdings.
 */
export async function restoreBookFromSnapshot(
  supabase: SupabaseClient,
  snapshotId: string
): Promise<{ portfolios: number; holdings: number }> {
  const { data: snap, error: sErr } = await supabase
    .from(PORTFELL_TABLES.snapshots)
    .select("id, payload")
    .eq("id", snapshotId)
    .single();
  if (sErr || !snap) throw new Error(sErr?.message ?? "Snapshot not found");

  const payload = snap.payload as BookSnapshotPayload;
  const portfolios = Array.isArray(payload.portfolios)
    ? payload.portfolios
    : [];
  const holdings = Array.isArray(payload.holdings) ? payload.holdings : [];

  // Wipe current book (holdings cascade from portfolios)
  const { error: delErr } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (delErr) throw new Error(delErr.message);

  if (portfolios.length > 0) {
    const { error: pIns } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .insert(portfolios);
    if (pIns) throw new Error(pIns.message);
  }
  if (holdings.length > 0) {
    const { error: hIns } = await supabase
      .from(PORTFELL_TABLES.holdings)
      .insert(holdings);
    if (hIns) throw new Error(hIns.message);
  }

  return { portfolios: portfolios.length, holdings: holdings.length };
}
