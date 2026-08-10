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
const KEEP_MANUAL = 20;

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
  const [{ data: nightly }, { data: preDelete }, { data: manuals }] =
    await Promise.all([
      supabase
        .from(PORTFELL_TABLES.snapshots)
        .select("id")
        .eq("kind", "nightly")
        .order("created_at", { ascending: false }),
      supabase
        .from(PORTFELL_TABLES.snapshots)
        .select("id")
        .eq("kind", "pre_delete")
        .order("created_at", { ascending: false }),
      supabase
        .from(PORTFELL_TABLES.snapshots)
        .select("id")
        .eq("kind", "manual")
        .order("created_at", { ascending: false }),
    ]);

  const dropIds = [
    ...(nightly ?? []).slice(KEEP_NIGHTLY).map((r) => r.id as string),
    ...(preDelete ?? []).slice(KEEP_PRE_DELETE).map((r) => r.id as string),
    ...(manuals ?? []).slice(KEEP_MANUAL).map((r) => r.id as string),
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

type SnapshotPortfolio = {
  id?: string;
  slug?: string;
  name?: string;
  cash_balance?: number;
  sort_order?: number;
  [key: string]: unknown;
};

type SnapshotHolding = {
  id?: string;
  portfolio_id?: string;
  ticker?: string;
  shares?: number;
  buy_price?: number;
  eoy_target?: number | null;
  target_call_pct?: number;
  stock_target_override?: number | null;
  sort_order?: number;
  [key: string]: unknown;
};

/**
 * Replace one live sheet's cash + holdings from a book snapshot.
 * Matches snapshot portfolio by id, then slug, then name.
 */
export async function restoreSheetFromSnapshot(
  supabase: SupabaseClient,
  snapshotId: string,
  livePortfolioId: string
): Promise<{ holdings: number; cash: number }> {
  const { data: snap, error: sErr } = await supabase
    .from(PORTFELL_TABLES.snapshots)
    .select("id, payload")
    .eq("id", snapshotId)
    .single();
  if (sErr || !snap) throw new Error(sErr?.message ?? "Snapshot not found");

  const { data: live, error: liveErr } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("id, slug, name")
    .eq("id", livePortfolioId)
    .single();
  if (liveErr || !live) throw new Error(liveErr?.message ?? "Sheet not found");

  const payload = snap.payload as BookSnapshotPayload;
  const portfolios = (Array.isArray(payload.portfolios)
    ? payload.portfolios
    : []) as SnapshotPortfolio[];
  const holdings = (Array.isArray(payload.holdings)
    ? payload.holdings
    : []) as SnapshotHolding[];

  const match =
    portfolios.find((p) => p.id === livePortfolioId) ||
    portfolios.find(
      (p) =>
        p.slug &&
        live.slug &&
        String(p.slug).toLowerCase() === String(live.slug).toLowerCase()
    ) ||
    portfolios.find(
      (p) =>
        p.name &&
        live.name &&
        String(p.name).toLowerCase() === String(live.name).toLowerCase()
    );

  if (!match) {
    throw new Error(
      `Snapshot has no sheet matching “${live.name}” (id/slug/name)`
    );
  }

  const snapPortfolioId = match.id;
  const sheetHoldings = holdings.filter((h) =>
    snapPortfolioId
      ? h.portfolio_id === snapPortfolioId
      : false
  );

  const cash = Number(match.cash_balance ?? 0);
  const { error: cashErr } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .update({
      cash_balance: cash,
      updated_at: new Date().toISOString(),
    })
    .eq("id", livePortfolioId);
  if (cashErr) throw new Error(cashErr.message);

  const { error: delErr } = await supabase
    .from(PORTFELL_TABLES.holdings)
    .delete()
    .eq("portfolio_id", livePortfolioId);
  if (delErr) throw new Error(delErr.message);

  if (sheetHoldings.length > 0) {
    const rows = sheetHoldings.map((h, i) => ({
      portfolio_id: livePortfolioId,
      ticker: String(h.ticker ?? "").toUpperCase(),
      shares: Number(h.shares ?? 0),
      buy_price: Number(h.buy_price ?? 0),
      eoy_target: h.eoy_target ?? null,
      target_call_pct: Number(h.target_call_pct ?? 0.15),
      stock_target_override: h.stock_target_override ?? null,
      sort_order: Number(h.sort_order ?? i + 1),
    }));
    const { error: hIns } = await supabase
      .from(PORTFELL_TABLES.holdings)
      .insert(rows);
    if (hIns) throw new Error(hIns.message);
  }

  return { holdings: sheetHoldings.length, cash };
}
