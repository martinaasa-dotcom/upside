import { describe, expect, it } from "vitest";
import { readDrConfig } from "./config";
import { exportEncryptedBook } from "./export-book";
import { bookChecksum } from "./checksum";
import { evaluateWalBackups } from "./wal-backups";
import type { BookSnapshotPayload } from "@/lib/book-snapshot";

describe("cold export", () => {
  const payload: BookSnapshotPayload = {
    portfolios: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", cash_balance: 1 }],
    holdings: [],
  };
  const wal = evaluateWalBackups(
    {
      backups: [
        { status: "COMPLETED", inserted_at: "2026-08-17T10:00:00.000Z" },
      ],
    },
    { now: new Date("2026-08-17T12:00:00.000Z"), maxAgeHours: 36 }
  );

  it("skips upload when the bucket is not configured", async () => {
    const result = await exportEncryptedBook({
      payload,
      checksum: bookChecksum(payload),
      wal,
      config: readDrConfig({}),
    });
    expect(result.uploaded).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/DR_S3_BUCKET/);
  });

  it("refuses to write plaintext if the encryption key is missing", async () => {
    const result = await exportEncryptedBook({
      payload,
      checksum: bookChecksum(payload),
      wal,
      config: {
        encryptionKey: undefined,
        accessToken: undefined,
        backupMaxAgeHours: 36,
        coldRetentionDays: 90,
        cold: {
          endpoint: "https://abc.r2.cloudflarestorage.com",
          region: "auto",
          bucket: "upside-lab-backups",
          accessKeyId: "AKIATEST",
          secretAccessKey: "secretsecret",
          prefix: "upside-lab/book-snapshots",
        },
      },
    });
    expect(result.uploaded).toBe(false);
    expect(result.reason).toMatch(/SNAPSHOT_ENCRYPTION_KEY/);
  });
});
