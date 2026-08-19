/** Names Margus can discuss that aren’t (yet) on a sheet. Local only. */

const KEY = "upside-watchlist-v1";

export function loadWatchlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .map((t) => String(t).trim().toUpperCase())
          .filter((t) => /^[A-Z0-9.=^-]{1,12}$/.test(t))
      ),
    ].slice(0, 40);
  } catch {
    return [];
  }
}

/**
 * Save locally and mirror to the server, so the Sunday email can suggest
 * names off this list. `sync: false` is for the mirror coming back down
 * from the server — without it, writing what we just received would push
 * it straight back up again.
 */
export function saveWatchlist(
  tickers: string[],
  opts?: { sync?: boolean }
) {
  if (typeof window === "undefined") return;
  const clean = [
    ...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)),
  ].slice(0, 40);
  try {
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    /* ignore */
  }
  if (opts?.sync === false) return;
  void pushWatchlist(clean);
}

async function pushWatchlist(tickers: string[]) {
  try {
    const { fetchOrQueue } = await import("@/lib/offline/queued-fetch");
    await fetchOrQueue(
      "/api/lab",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchlist: tickers }),
      },
      { kind: "preference" }
    );
  } catch {
    // The list is already saved on this device; a failed sync only means
    // the Sunday email won't see it yet.
  }
}

export function addWatchlistTicker(list: string[], ticker: string): string[] {
  const t = ticker.trim().toUpperCase();
  if (!t) return list;
  const next = [...new Set([t, ...list])].slice(0, 40);
  saveWatchlist(next);
  return next;
}

export function removeWatchlistTicker(list: string[], ticker: string): string[] {
  const next = list.filter((t) => t !== ticker.toUpperCase());
  saveWatchlist(next);
  return next;
}
