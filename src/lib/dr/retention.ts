import type { ColdStorageConfig } from "@/lib/dr/config";
import { deleteObject, listObjects } from "@/lib/dr/s3";

export type ColdRetentionResult = {
  checked: number;
  deleted: string[];
  errors: string[];
};

/** `prefix/YYYY/MM/DD/book-....` — the date `objectKeys()` stamps into every key. */
export function keyDate(key: string, prefix: string): Date | null {
  const rest = key.startsWith(`${prefix}/`) ? key.slice(prefix.length + 1) : key;
  const m = rest.match(/^(\d{4})\/(\d{2})\/(\d{2})\//);
  if (!m) return null;
  const [, y, mo, d] = m;
  const at = new Date(`${y}-${mo}-${d}T00:00:00.000Z`);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Deletes cold snapshot + manifest objects older than `retentionDays`. This
 * is the backup's own bounded window, not a per-user purge — the object is
 * a whole-book export (every sheet, every owner) in one encrypted blob, so
 * there is no single user's data to cut out of it. Age it out on a fixed
 * schedule instead; that is also what the privacy policy promises.
 */
export async function purgeExpiredColdSnapshots(opts: {
  config: ColdStorageConfig;
  retentionDays: number;
  now?: Date;
}): Promise<ColdRetentionResult> {
  const { config, retentionDays } = opts;
  const now = opts.now ?? new Date();
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;

  const objects = await listObjects(config, `${config.prefix}/`);
  const result: ColdRetentionResult = { checked: objects.length, deleted: [], errors: [] };

  for (const obj of objects) {
    const fromKey = keyDate(obj.key, config.prefix);
    const fromModified = obj.lastModified ? new Date(obj.lastModified) : null;
    const at = fromKey ?? (fromModified && !Number.isNaN(fromModified.getTime()) ? fromModified : null);
    if (!at || at.getTime() >= cutoff) continue;
    try {
      await deleteObject(config, obj.key);
      result.deleted.push(obj.key);
    } catch (err) {
      result.errors.push(
        `${obj.key}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return result;
}
