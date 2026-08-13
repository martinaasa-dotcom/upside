/**
 * Instant-load cache for Communities — same "show cached instantly, then
 * quietly refresh" pattern as Thesis Pulse. Stores the raw JSON from
 * /api/communities/[id] + /api/communities/[id]/book so CommunityView can
 * hydrate synchronously on mount instead of always showing a loading
 * state, and so CommunitiesList can prefetch a community's data in the
 * background the moment the list loads (before the user even clicks in).
 */

const CACHE_PREFIX = "upside-community-v1:";
const CACHE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes — communities update slowly

export type CommunityCacheEntry = {
  meta: unknown;
  book: unknown;
  cachedAt: string;
};

function cacheKey(communityId: string): string {
  return `${CACHE_PREFIX}${communityId}`;
}

export function loadCommunityCache(
  communityId: string
): CommunityCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(communityId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CommunityCacheEntry | null;
    if (!parsed?.meta || !parsed?.book || !parsed?.cachedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCommunityCache(
  communityId: string,
  entry: { meta: unknown; book: unknown }
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      cacheKey(communityId),
      JSON.stringify({ ...entry, cachedAt: new Date().toISOString() })
    );
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
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(cacheKey(communityId));
  } catch {
    /* ignore */
  }
}

/** Fetch + cache one community's meta+book in the background — used by
 * CommunitiesList to warm the cache for every row as soon as the list is
 * known, so clicking in (even for the first time this session) already
 * has data ready instead of starting the fetch from zero. */
export async function prefetchCommunity(communityId: string): Promise<void> {
  try {
    const cached = loadCommunityCache(communityId);
    if (isCommunityCacheFresh(cached)) return;
    const [metaRes, bookRes] = await Promise.all([
      fetch(`/api/communities/${communityId}`, { cache: "no-store" }),
      fetch(`/api/communities/${communityId}/book`, { cache: "no-store" }),
    ]);
    if (!metaRes.ok || !bookRes.ok) return;
    const [meta, book] = await Promise.all([metaRes.json(), bookRes.json()]);
    saveCommunityCache(communityId, { meta, book });
  } catch {
    /* best-effort prefetch — CommunityView's own fetch is the source of truth */
  }
}
