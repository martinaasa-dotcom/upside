import type { BookSnapshotPayload } from "@/lib/book-snapshot";
import { captureBookPayload } from "@/lib/book-snapshot";
import { bookChecksum, type BookChecksum } from "@/lib/dr/checksum";
import { readDrConfig, type DrConfig } from "@/lib/dr/config";
import { encryptUtf8, parseEncryptionKey } from "@/lib/dr/encrypt";
import { putObject } from "@/lib/dr/s3";
import type { WalBackupCheck } from "@/lib/dr/wal-backups";
import { verifyWalBackups } from "@/lib/dr/wal-backups";
import { supabaseProjectRef } from "@/lib/supabase/env";
import type { SupabaseClient } from "@supabase/supabase-js";

export const COLD_SNAPSHOT_VERSION = 1 as const;

export type ColdBookSnapshot = {
  version: typeof COLD_SNAPSHOT_VERSION;
  capturedAt: string;
  kind: "cold";
  payload: BookSnapshotPayload;
  checksum: BookChecksum;
};

export type ColdManifest = {
  version: typeof COLD_SNAPSHOT_VERSION;
  capturedAt: string;
  objectKey: string;
  checksum: BookChecksum;
  wal: WalBackupCheck;
  encryption: "aes-256-gcm";
};

export type ColdExportResult = {
  uploaded: boolean;
  skipped?: boolean;
  reason: string;
  objectKey?: string;
  manifestKey?: string;
};

export type DrJobResult = {
  ok: boolean;
  capturedAt: string;
  checksum: BookChecksum | null;
  wal: WalBackupCheck;
  cold: ColdExportResult;
  warnings: string[];
};

function objectKeys(capturedAt: Date, prefix: string): {
  objectKey: string;
  manifestKey: string;
} {
  const iso = capturedAt.toISOString();
  const day = iso.slice(0, 10);
  const [y, m, d] = day.split("-");
  const stamp = iso.replace(/[:.]/g, "-");
  const base = `${prefix}/${y}/${m}/${d}/book-${stamp}`;
  return {
    objectKey: `${base}.json.ulenc`,
    manifestKey: `${base}.manifest.json`,
  };
}

export async function exportEncryptedBook(opts: {
  payload: BookSnapshotPayload;
  checksum: BookChecksum;
  wal: WalBackupCheck;
  config: DrConfig;
  capturedAt?: Date;
}): Promise<ColdExportResult> {
  const { payload, checksum, wal, config } = opts;
  const capturedAt = opts.capturedAt ?? new Date();
  if (!config.cold) {
    return {
      uploaded: false,
      skipped: true,
      reason:
        "Cold storage skipped. Set DR_S3_BUCKET, DR_S3_ACCESS_KEY_ID, and DR_S3_SECRET_ACCESS_KEY (R2: also DR_S3_ENDPOINT).",
    };
  }
  if (!config.encryptionKey) {
    return {
      uploaded: false,
      skipped: true,
      reason:
        "Cold storage skipped. SNAPSHOT_ENCRYPTION_KEY is required so the book is never written in the clear.",
    };
  }
  const key = parseEncryptionKey(config.encryptionKey);
  const snapshot: ColdBookSnapshot = {
    version: COLD_SNAPSHOT_VERSION,
    capturedAt: capturedAt.toISOString(),
    kind: "cold",
    payload,
    checksum,
  };
  const { objectKey, manifestKey } = objectKeys(capturedAt, config.cold.prefix);
  const encrypted = encryptUtf8(JSON.stringify(snapshot), key);
  const manifest: ColdManifest = {
    version: COLD_SNAPSHOT_VERSION,
    capturedAt: snapshot.capturedAt,
    objectKey,
    checksum,
    wal,
    encryption: "aes-256-gcm",
  };
  await putObject(
    config.cold,
    objectKey,
    Buffer.from(encrypted, "utf8")
  );
  await putObject(
    config.cold,
    manifestKey,
    Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  );
  return {
    uploaded: true,
    reason: `Encrypted book uploaded to ${objectKey}.`,
    objectKey,
    manifestKey,
  };
}

export async function runDisasterRecoveryJob(opts: {
  supabase: SupabaseClient;
  config?: DrConfig;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<DrJobResult> {
  const config = opts.config ?? readDrConfig();
  const capturedAt = opts.now ?? new Date();
  const warnings: string[] = [];

  const wal = await verifyWalBackups({
    projectRef: supabaseProjectRef(),
    accessToken: config.accessToken,
    maxAgeHours: config.backupMaxAgeHours,
    fetchImpl: opts.fetchImpl,
    now: capturedAt,
  });
  if (!wal.skipped && !wal.ok) warnings.push(wal.reason);

  const payload = await captureBookPayload(opts.supabase);
  const checksum = bookChecksum(payload);
  const cold = await exportEncryptedBook({
    payload,
    checksum,
    wal,
    config,
    capturedAt,
  });
  if (cold.skipped) warnings.push(cold.reason);

  const ok =
    checksum.portfolioCount >= 0 &&
    (wal.skipped || wal.ok) &&
    (cold.skipped || cold.uploaded);

  return {
    ok,
    capturedAt: capturedAt.toISOString(),
    checksum,
    wal,
    cold,
    warnings,
  };
}
