/**
 * Names that resolved nowhere, remembered for a while.
 *
 * A symbol Yahoo does not know is the most expensive kind of request in the
 * whole market layer, not the cheapest. `yahooQuoteCandidates` walks the
 * bare symbol plus 16 European suffixes, and each candidate costs a
 * `quote()` and a `chart()`, so **one unresolvable ticker measured at 52
 * upstream Yahoo requests** -- against free tiers the entire product shares.
 *
 * A hit costs one round trip because the walk stops at the first match. Only
 * misses pay the full 52, and misses are exactly what repeat: a typo in an
 * import file, a delisted holding someone never removed, a scraper walking
 * the alphabet. Remembering them turns the second and every later attempt
 * into nothing at all.
 *
 * Deliberately short-lived and deliberately small. A real listing that was
 * briefly unreachable must not be written off for long, so the window is
 * minutes, not hours -- long enough to absorb a retry storm, short enough
 * that a newly listed name appears the same session.
 */

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;

const missedAt = new Map<string, number>();

function prune(now: number) {
  for (const [symbol, at] of missedAt) {
    if (now - at > TTL_MS) missedAt.delete(symbol);
  }
  if (missedAt.size <= MAX_ENTRIES) return;
  // Oldest first: Map preserves insertion order and every write re-inserts.
  const extra = missedAt.size - MAX_ENTRIES;
  for (const symbol of [...missedAt.keys()].slice(0, extra)) {
    missedAt.delete(symbol);
  }
}

export function markUnresolvable(symbols: readonly string[], now = Date.now()) {
  for (const symbol of symbols) {
    const key = symbol.trim().toUpperCase();
    if (!key) continue;
    missedAt.delete(key);
    missedAt.set(key, now);
  }
  prune(now);
}

export function isRecentlyUnresolvable(symbol: string, now = Date.now()): boolean {
  const at = missedAt.get(symbol.trim().toUpperCase());
  if (at == null) return false;
  if (now - at > TTL_MS) {
    missedAt.delete(symbol.trim().toUpperCase());
    return false;
  }
  return true;
}

/** Split a request into names worth asking about and names we just asked about. */
export function partitionUnresolvable(
  symbols: readonly string[],
  now = Date.now()
): { worthAsking: string[]; recentlyMissed: string[] } {
  const worthAsking: string[] = [];
  const recentlyMissed: string[] = [];
  for (const symbol of symbols) {
    if (isRecentlyUnresolvable(symbol, now)) recentlyMissed.push(symbol);
    else worthAsking.push(symbol);
  }
  return { worthAsking, recentlyMissed };
}

export function resetUnresolvableForTests() {
  missedAt.clear();
}
