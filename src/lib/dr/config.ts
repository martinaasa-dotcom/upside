export type ColdStorageConfig = {
  endpoint: string | undefined;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
};

export type DrConfig = {
  encryptionKey: string | undefined;
  accessToken: string | undefined;
  backupMaxAgeHours: number;
  coldRetentionDays: number;
  cold: ColdStorageConfig | null;
};

function trim(raw: string | undefined): string | undefined {
  const t = raw?.trim();
  return t || undefined;
}

export function readDrConfig(
  env: Record<string, string | undefined> = process.env
): DrConfig {
  const bucket = trim(env.DR_S3_BUCKET);
  const accessKeyId = trim(env.DR_S3_ACCESS_KEY_ID);
  const secretAccessKey = trim(env.DR_S3_SECRET_ACCESS_KEY);
  const endpoint = trim(env.DR_S3_ENDPOINT);
  const hasCold = Boolean(bucket && accessKeyId && secretAccessKey);
  const rawAge = Number(env.DR_BACKUP_MAX_AGE_HOURS);
  const rawRetention = Number(env.DR_COLD_RETENTION_DAYS);
  return {
    encryptionKey: trim(env.SNAPSHOT_ENCRYPTION_KEY),
    accessToken: trim(env.SUPABASE_ACCESS_TOKEN),
    backupMaxAgeHours:
      Number.isFinite(rawAge) && rawAge > 0 ? rawAge : 36,
    // 30 days. These cold copies exist to rebuild after a catastrophic
    // Supabase failure, a mass accidental delete, or ransomware — all of
    // which are noticed in days, not months. A longer window reads as an
    // archive rather than a backup, and every extra day is a day a deleted
    // account's data survives in an object that cannot be edited to remove
    // one person. Override with DR_COLD_RETENTION_DAYS if a restore need
    // ever genuinely reaches further back.
    coldRetentionDays:
      Number.isFinite(rawRetention) && rawRetention > 0 ? rawRetention : 30,
    cold: hasCold
      ? {
          endpoint,
          region: trim(env.DR_S3_REGION) || (endpoint ? "auto" : "us-east-1"),
          bucket: bucket!,
          accessKeyId: accessKeyId!,
          secretAccessKey: secretAccessKey!,
          prefix: (trim(env.DR_S3_PREFIX) || "upside-lab/book-snapshots").replace(
            /^\/+|\/+$/g,
            ""
          ),
        }
      : null,
  };
}
