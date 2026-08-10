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

export function saveWatchlist(tickers: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(
        [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))].slice(
          0,
          40
        )
      )
    );
  } catch {
    /* ignore */
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
