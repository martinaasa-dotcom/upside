import type { Holding, Portfolio } from "@/lib/types";

export type CachedBook = {
  userId: string;
  source: "demo" | "supabase";
  portfolios: Portfolio[];
  holdings: Holding[];
  locked: boolean;
  fetchedAt: number;
};

const STORAGE_KEY = "upside-book-cache-v1";
/** A week-old book is still a better first paint than a spinner. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Skip a silent refetch (tab/room return) when we loaded this recently. */
export const BOOK_SILENT_REFRESH_MS = 20_000;

export function isBookFetchFresh(
  fetchedAt: number | null | undefined
): boolean {
  if (fetchedAt == null || !Number.isFinite(fetchedAt)) return false;
  return Date.now() - fetchedAt < BOOK_SILENT_REFRESH_MS;
}

let bookCache: CachedBook | null = null;
let seedClaimedForUser: string | null = null;
let hydrated = false;

function isCachedBook(value: unknown): value is CachedBook {
  if (!value || typeof value !== "object") return false;
  const v = value as CachedBook;
  return (
    typeof v.userId === "string" &&
    (v.source === "demo" || v.source === "supabase") &&
    Array.isArray(v.portfolios) &&
    Array.isArray(v.holdings) &&
    typeof v.fetchedAt === "number"
  );
}

function hydrateFromStorage() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as CachedBook | null;
    if (!isCachedBook(parsed)) return;
    if (Date.now() - parsed.fetchedAt > MAX_AGE_MS) return;
    bookCache = parsed;
  } catch {
    /* ignore */
  }
}

function persist(next: CachedBook | null) {
  if (typeof window === "undefined") return;
  try {
    if (!next) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readBookCache(userId: string | null | undefined): CachedBook | null {
  hydrateFromStorage();
  if (!userId || !bookCache || bookCache.userId !== userId) return null;
  return bookCache;
}

export function writeBookCache(next: CachedBook) {
  bookCache = next;
  persist(next);
}

export function clearBookCache() {
  bookCache = null;
  seedClaimedForUser = null;
  persist(null);
}

export function shouldClaimSeed(userId: string | null | undefined): boolean {
  if (!userId) return true;
  return seedClaimedForUser !== userId;
}

export function markSeedClaimed(userId: string) {
  seedClaimedForUser = userId;
}
