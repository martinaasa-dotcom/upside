import type { ConvictionMap } from "@/lib/conviction";

/**
 * Per-owner Lab state. Conviction is the thesis note per ticker; the
 * watchlist rides along so the Sunday email can suggest names the reader
 * is watching but does not own yet.
 */
export type LabBundle = {
  conviction: ConvictionMap;
  watchlist: string[];
  updatedAt?: string;
};

export function emptyLabBundle(): LabBundle {
  return { conviction: {}, watchlist: [] };
}

/** Same shape the browser's watchlist helper enforces. */
export function sanitizeWatchlist(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .map((t) => String(t).trim().toUpperCase())
        .filter((t) => /^[A-Z0-9.=^-]{1,12}$/.test(t))
    ),
  ].slice(0, 40);
}
