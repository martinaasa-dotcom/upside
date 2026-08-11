import type { Holding, Portfolio } from "@/lib/types";

export type CachedBook = {
  userId: string;
  source: "demo" | "supabase";
  portfolios: Portfolio[];
  holdings: Holding[];
  locked: boolean;
  fetchedAt: number;
};

let bookCache: CachedBook | null = null;
let seedClaimedForUser: string | null = null;

export function readBookCache(userId: string | null | undefined): CachedBook | null {
  if (!userId || !bookCache || bookCache.userId !== userId) return null;
  return bookCache;
}

export function writeBookCache(next: CachedBook) {
  bookCache = next;
}

export function clearBookCache() {
  bookCache = null;
  seedClaimedForUser = null;
}

export function shouldClaimSeed(userId: string | null | undefined): boolean {
  if (!userId) return true;
  return seedClaimedForUser !== userId;
}

export function markSeedClaimed(userId: string) {
  seedClaimedForUser = userId;
}
