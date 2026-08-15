/**
 * Instant-load cache for Communities — same "show cached instantly, then
 * quietly refresh" pattern as Thesis Pulse. Stores the raw JSON from
 * /api/communities/[id] + /api/communities/[id]/book so CommunityView can
 * hydrate synchronously on mount instead of always showing a loading
 * state, and so CommunitiesList can prefetch a community's data in the
 * background the moment the list loads (before the user even clicks in).
 */

import { todayKeyInTz } from "@/lib/timezone";
import type { DuelPick } from "@/lib/daily-duel";

const CACHE_PREFIX = "upside-community-v1:";
const LIST_CACHE_KEY = "upside-communities-list-v1";
const DUEL_CACHE_PREFIX = "upside-community-duel-v1:";
const CACHE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes — communities update slowly

export type CommunityDuelCache = {
  dayKey: string;
  pair: { a: string; b: string } | null;
  myPick: DuelPick | null;
  counts: { a: number; b: number };
  names?: { a: string[]; b: string[] };
  settled: boolean;
  pickCount: number;
};

const duelMemory = new Map<string, CommunityDuelCache>();

function duelCacheKey(communityId: string): string {
  return `${DUEL_CACHE_PREFIX}${communityId}`;
}

function isDuelShape(v: unknown): v is CommunityDuelCache {
  if (!v || typeof v !== "object") return false;
  const o = v as CommunityDuelCache;
  return (
    typeof o.dayKey === "string" &&
    (o.myPick === "a" || o.myPick === "b" || o.myPick == null) &&
    typeof o.pickCount === "number" &&
    typeof o.settled === "boolean" &&
    o.counts != null &&
    typeof o.counts.a === "number" &&
    typeof o.counts.b === "number"
  );
}

export function loadCommunityDuelCache(
  communityId: string,
  dayKey: string = todayKeyInTz()
): CommunityDuelCache | null {
  const mem = duelMemory.get(communityId);
  if (mem && mem.dayKey === dayKey) return mem;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(duelCacheKey(communityId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CommunityDuelCache;
    if (!isDuelShape(parsed) || parsed.dayKey !== dayKey) return null;
    duelMemory.set(communityId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function saveCommunityDuelCache(
  communityId: string,
  duel: CommunityDuelCache
) {
  duelMemory.set(communityId, duel);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(duelCacheKey(communityId), JSON.stringify(duel));
  } catch {
    /* quota / private mode */
  }
}

export type CommunityListRow = {
  id: string;
  name: string;
  role: string;
  visibility?: "public" | "private";
  kind?: "circle" | "classroom";
};

export type CommunityCacheEntry = {
  meta: unknown;
  book: unknown;
  cachedAt: string;
};

const detailMemory = new Map<string, CommunityCacheEntry>();
let listMemory: CommunityListRow[] | null = null;

function cacheKey(communityId: string): string {
  return `${CACHE_PREFIX}${communityId}`;
}

export function loadCommunityListCache(): CommunityListRow[] | null {
  if (listMemory) return listMemory;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LIST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    listMemory = parsed as CommunityListRow[];
    return listMemory;
  } catch {
    return null;
  }
}

export function saveCommunityListCache(rows: CommunityListRow[]) {
  listMemory = rows;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LIST_CACHE_KEY, JSON.stringify(rows));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadCommunityCache(
  communityId: string
): CommunityCacheEntry | null {
  const mem = detailMemory.get(communityId);
  if (mem) return mem;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(communityId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CommunityCacheEntry | null;
    if (!parsed?.meta || !parsed?.book || !parsed?.cachedAt) return null;
    detailMemory.set(communityId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function saveCommunityCache(
  communityId: string,
  entry: { meta: unknown; book: unknown }
) {
  const next: CommunityCacheEntry = {
    ...entry,
    cachedAt: new Date().toISOString(),
  };
  detailMemory.set(communityId, next);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(cacheKey(communityId), JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

export function isCommunityCacheFresh(entry: CommunityCacheEntry | null): boolean {
  if (!entry?.cachedAt) return false;
  const ts = new Date(entry.cachedAt).getTime();
  return Number.isFinite(ts) && Date.now() - ts < CACHE_MAX_AGE_MS;
}

/** Drop a community's cached entry — call after deleting/leaving one so a
 * stale copy doesn't linger in localStorage forever. */
export function clearCommunityCache(communityId: string) {
  detailMemory.delete(communityId);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(cacheKey(communityId));
  } catch {
    /* ignore */
  }
}

export function prefetchCommunityList(rows: CommunityListRow[]) {
  for (const row of rows) void prefetchCommunity(row.id);
}

/** Fetch + cache one community's meta+book in the background — used by
 * CommunitiesList to warm the cache for every row as soon as the list is
 * known, so clicking in (even for the first time this session) already
 * has data ready instead of starting the fetch from zero. */
export async function prefetchCommunity(communityId: string): Promise<void> {
  try {
    const cached = loadCommunityCache(communityId);
    const needBook = !isCommunityCacheFresh(cached);
    const needDuel = loadCommunityDuelCache(communityId) == null;
    if (!needBook && !needDuel) return;
    const [metaRes, bookRes, duelRes] = await Promise.all([
      needBook
        ? fetch(`/api/communities/${communityId}`, { cache: "no-store" })
        : null,
      needBook
        ? fetch(`/api/communities/${communityId}/book`, { cache: "no-store" })
        : null,
      needDuel
        ? fetch(`/api/communities/${communityId}/duel`, { cache: "no-store" })
        : null,
    ]);
    if (needBook && metaRes && bookRes && metaRes.ok && bookRes.ok) {
      const [meta, book] = await Promise.all([metaRes.json(), bookRes.json()]);
      saveCommunityCache(communityId, { meta, book });
    }
    if (needDuel && duelRes?.ok) {
      const duel = (await duelRes.json()) as CommunityDuelCache;
      if (isDuelShape(duel)) saveCommunityDuelCache(communityId, duel);
    }
  } catch {
    /* best-effort prefetch — CommunityView's own fetch is the source of truth */
  }
}
