/**
 * Decrypt a cold snapshot and restore it into a throwaway schema, then
 * check that SUM(cash) + SUM(holdings cost) matches the snapshot checksum.
 *
 *   npx tsx scripts/restore-snapshot.ts --file path/to/book.json.ulenc
 *   npx tsx scripts/restore-snapshot.ts --s3-key upside-lab/book-snapshots/...
 *   npx tsx scripts/restore-snapshot.ts --latest
 *   npx tsx scripts/restore-snapshot.ts --file snap.ulenc --require-sql
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { captureBookPayload, type BookSnapshotPayload } from "../src/lib/book-snapshot";
import { bookChecksum, checksumsMatch } from "../src/lib/dr/checksum";
import { readDrConfig } from "../src/lib/dr/config";
import {
  decryptUtf8,
  isEncryptedSnapshot,
  parseEncryptionKey,
} from "../src/lib/dr/encrypt";
import type { ColdBookSnapshot } from "../src/lib/dr/export-book";
import { getObject, listObjects } from "../src/lib/dr/s3";
import { restoreSnapshot } from "../src/lib/dr/restore-schema";
import {
  supabaseDatabaseUrl,
  supabaseServiceRoleKey,
  supabaseUrl,
} from "../src/lib/supabase/env";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseSnapshot(raw: string, encryptionKey?: string): ColdBookSnapshot {
  const text = isEncryptedSnapshot(raw)
    ? decryptUtf8(raw, parseEncryptionKey(encryptionKey))
    : raw;
  const parsed = JSON.parse(text) as ColdBookSnapshot | BookSnapshotPayload;
  if (
    parsed &&
    typeof parsed === "object" &&
    "payload" in parsed &&
    parsed.payload
  ) {
    return parsed as ColdBookSnapshot;
  }
  const payload = parsed as BookSnapshotPayload;
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    kind: "cold",
    payload,
    checksum: bookChecksum(payload),
  };
}

async function loadFromS3(key?: string, latest?: boolean): Promise<string> {
  const config = readDrConfig();
  if (!config.cold) {
    throw new Error(
      "Cold storage is not configured. Set DR_S3_BUCKET and keys, or pass --file."
    );
  }
  let objectKey = key;
  if (latest || !objectKey) {
    const listed = await listObjects(config.cold, config.cold.prefix);
    const enc = listed
      .filter((o) => o.key.endsWith(".json.ulenc"))
      .sort((a, b) => a.key.localeCompare(b.key));
    const last = enc[enc.length - 1];
    if (!last) throw new Error("No encrypted snapshots in the bucket prefix.");
    objectKey = last.key;
  }
  console.error(`Fetching s3://${config.cold.bucket}/${objectKey}`);
  return (await getObject(config.cold, objectKey)).toString("utf8");
}

async function loadLiveBook(): Promise<ColdBookSnapshot> {
  const url = supabaseUrl();
  const key = supabaseServiceRoleKey();
  if (!url || !key) {
    throw new Error("Live load needs SUPABASE_SERVICE_ROLE_KEY and the project URL.");
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const payload = await captureBookPayload(supabase);
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    kind: "cold",
    payload,
    checksum: bookChecksum(payload),
  };
}

async function main() {
  const file = arg("--file");
  const s3Key = arg("--s3-key");
  const latest = hasFlag("--latest");
  const live = hasFlag("--live");
  const requireSql = hasFlag("--require-sql");
  const databaseUrl = arg("--database") || supabaseDatabaseUrl();

  let raw: string | undefined;
  let snap: ColdBookSnapshot;
  if (file) {
    raw = readFileSync(file, "utf8");
    snap = parseSnapshot(raw, readDrConfig().encryptionKey);
  } else if (s3Key || latest) {
    raw = await loadFromS3(s3Key, latest);
    snap = parseSnapshot(raw, readDrConfig().encryptionKey);
  } else if (live) {
    snap = await loadLiveBook();
  } else {
    console.error(
      "Pass --file, --s3-key, --latest, or --live (capture current book and round-trip it)."
    );
    process.exit(2);
  }

  const stored = snap.checksum;
  const recomputed = bookChecksum(snap.payload);
  if (!checksumsMatch(stored, recomputed)) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          reason: "Snapshot checksum does not match its own payload.",
          stored,
          recomputed,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const report = restoreSnapshot(snap.payload, {
    databaseUrl,
    requireSql,
  });
  console.log(
    JSON.stringify(
      {
        capturedAt: snap.capturedAt,
        ...report,
      },
      null,
      2
    )
  );
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
