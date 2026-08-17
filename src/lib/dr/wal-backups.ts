/**
 * Verify Supabase daily / WAL-G backups via the Management API.
 * https://supabase.com/docs/guides/platform/backups
 * GET /v1/projects/{ref}/database/backups
 */

export type SupabaseBackupRow = {
  id?: number;
  is_physical_backup?: boolean;
  status?: string;
  inserted_at?: string;
};

export type SupabaseBackupsResponse = {
  region?: string;
  walg_enabled?: boolean;
  pitr_enabled?: boolean;
  backups?: SupabaseBackupRow[];
  physical_backup_data?: {
    earliest_physical_backup_date_unix?: number;
    latest_physical_backup_date_unix?: number;
  };
};

export type WalBackupCheck = {
  ok: boolean;
  skipped?: boolean;
  reason: string;
  walgEnabled: boolean;
  pitrEnabled: boolean;
  latestBackupAt: string | null;
  ageHours: number | null;
  backupCount: number;
};

const COMPLETED = /^(completed|complete|ok|success)$/i;

export function latestBackupInstant(
  body: SupabaseBackupsResponse
): Date | null {
  const unix = body.physical_backup_data?.latest_physical_backup_date_unix;
  if (typeof unix === "number" && Number.isFinite(unix) && unix > 0) {
    const ms = unix > 1e12 ? unix : unix * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d;
  }
  let latest: Date | null = null;
  for (const row of body.backups ?? []) {
    if (row.status && !COMPLETED.test(row.status)) continue;
    if (!row.inserted_at) continue;
    const d = new Date(row.inserted_at);
    if (Number.isNaN(d.getTime())) continue;
    if (!latest || d > latest) latest = d;
  }
  return latest;
}

export function evaluateWalBackups(
  body: SupabaseBackupsResponse,
  opts: { now?: Date; maxAgeHours: number }
): WalBackupCheck {
  const now = opts.now ?? new Date();
  const walgEnabled = Boolean(body.walg_enabled);
  const pitrEnabled = Boolean(body.pitr_enabled);
  const backupCount = Array.isArray(body.backups) ? body.backups.length : 0;
  const latest = latestBackupInstant(body);
  const ageHours =
    latest != null
      ? (now.getTime() - latest.getTime()) / 3_600_000
      : null;

  const base = {
    walgEnabled,
    pitrEnabled,
    latestBackupAt: latest ? latest.toISOString() : null,
    ageHours: ageHours != null ? Math.round(ageHours * 10) / 10 : null,
    backupCount,
  };

  if (!latest) {
    return {
      ok: false,
      reason:
        "Management API returned no completed daily backup and no WAL-G restore point.",
      ...base,
    };
  }
  if (ageHours != null && ageHours > opts.maxAgeHours) {
    return {
      ok: false,
      reason: `Latest backup is ${base.ageHours} hours old (limit ${opts.maxAgeHours}h).`,
      ...base,
    };
  }
  if (pitrEnabled && !walgEnabled) {
    return {
      ok: false,
      reason:
        "Point-in-time recovery is on, but WAL-G is not enabled. WAL files are not being archived.",
      ...base,
    };
  }
  const kind = pitrEnabled || walgEnabled ? "WAL-G / PITR" : "daily physical";
  return {
    ok: true,
    reason: `${kind} backup is current (${base.ageHours}h old).`,
    ...base,
  };
}

export async function fetchSupabaseBackups(
  projectRef: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<SupabaseBackupsResponse> {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/backups`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Supabase backups API ${res.status}: ${text.slice(0, 400)}`
    );
  }
  try {
    return JSON.parse(text) as SupabaseBackupsResponse;
  } catch {
    throw new Error("Supabase backups API returned non-JSON.");
  }
}

export async function verifyWalBackups(opts: {
  projectRef: string | undefined;
  accessToken: string | undefined;
  maxAgeHours: number;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<WalBackupCheck> {
  if (!opts.accessToken) {
    return {
      ok: false,
      skipped: true,
      reason: "WAL backup listing skipped (no SUPABASE_ACCESS_TOKEN). That check is optional.",
      walgEnabled: false,
      pitrEnabled: false,
      latestBackupAt: null,
      ageHours: null,
      backupCount: 0,
    };
  }
  if (!opts.projectRef) {
    return {
      ok: false,
      skipped: true,
      reason:
        "No project ref. Set SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL.",
      walgEnabled: false,
      pitrEnabled: false,
      latestBackupAt: null,
      ageHours: null,
      backupCount: 0,
    };
  }
  const body = await fetchSupabaseBackups(
    opts.projectRef,
    opts.accessToken,
    opts.fetchImpl
  );
  return evaluateWalBackups(body, {
    now: opts.now,
    maxAgeHours: opts.maxAgeHours,
  });
}
