/** When a sheet was last replaced from CSV or paste. Local only. */

const KEY = "portfell-sheet-imported-v1";

function loadMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function markSheetImported(portfolioId: string) {
  if (typeof window === "undefined" || !portfolioId) return;
  try {
    const next = { ...loadMap(), [portfolioId]: new Date().toISOString() };
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function loadSheetImportedAt(portfolioId: string): string | null {
  const at = loadMap()[portfolioId];
  return at ?? null;
}

export function formatImportedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    timeZone: "Europe/Tallinn",
    dateStyle: "medium",
    timeStyle: "short",
  });
}
