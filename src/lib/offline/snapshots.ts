import type { Holding, Portfolio, Quote } from "@/lib/types";
import { idbDelete, idbGet, idbSet } from "@/lib/offline/idb";

/** Fired after IndexedDB restores a book the localStorage cache didn't have. */
export const OFFLINE_CACHE_READY = "upside:offline-cache-ready";

export const SNAP_BOOK = "book";
export const SNAP_QUOTES = "quotes";
export const SNAP_LAB = "lab";
export const SNAP_COMPOUND = "compound";

export type CachedQuotesSnap = {
  savedAt: number;
  quotes: Record<string, Quote>;
};

export async function persistOfflineValue(
  key: string,
  value: unknown | null
): Promise<void> {
  if (typeof window === "undefined") return;
  if (value == null) {
    await idbDelete(key);
    return;
  }
  await idbSet(key, value);
}

export async function readOfflineValue<T>(key: string): Promise<T | undefined> {
  if (typeof window === "undefined") return undefined;
  return idbGet<T>(key);
}

export type CachedBookSnap = {
  userId: string;
  source: "demo" | "supabase";
  portfolios: Portfolio[];
  holdings: Holding[];
  locked: boolean;
  fetchedAt: number;
};

export function persistBookSnapshot(next: CachedBookSnap | null) {
  void persistOfflineValue(SNAP_BOOK, next);
}

export function persistQuotesSnapshot(next: CachedQuotesSnap | null) {
  void persistOfflineValue(SNAP_QUOTES, next);
}

export function persistLabSnapshot(next: unknown) {
  void persistOfflineValue(SNAP_LAB, next);
}

export function persistCompoundSnapshot(next: unknown) {
  void persistOfflineValue(SNAP_COMPOUND, next);
}

function isCachedBook(value: unknown): value is CachedBookSnap {
  if (!value || typeof value !== "object") return false;
  const v = value as CachedBookSnap;
  return (
    typeof v.userId === "string" &&
    (v.source === "demo" || v.source === "supabase") &&
    Array.isArray(v.portfolios) &&
    Array.isArray(v.holdings) &&
    typeof v.fetchedAt === "number"
  );
}

function isQuotesSnap(value: unknown): value is CachedQuotesSnap {
  if (!value || typeof value !== "object") return false;
  const v = value as CachedQuotesSnap;
  return typeof v.savedAt === "number" && Boolean(v.quotes) && typeof v.quotes === "object";
}

/**
 * Copy IndexedDB snapshots back into the sync localStorage caches when
 * those were emptied (Safari eviction, quota). The book still paints from
 * localStorage on the first frame; this fills a hole a tick later.
 */
export async function restoreOfflineSnapshots(): Promise<{
  book: CachedBookSnap | null;
  quotes: CachedQuotesSnap | null;
}> {
  const [bookRaw, quotesRaw] = await Promise.all([
    readOfflineValue<unknown>(SNAP_BOOK),
    readOfflineValue<unknown>(SNAP_QUOTES),
  ]);
  const book = isCachedBook(bookRaw) ? bookRaw : null;
  const quotes = isQuotesSnap(quotesRaw) ? quotesRaw : null;
  return { book, quotes };
}
