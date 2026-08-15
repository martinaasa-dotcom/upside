/** Which book Today should show. "all" is the combined family view. */

const KEY = "portfell-home-sheet-v1";

export type HomeSheetId = "all" | string;

export function loadHomeSheetId(): HomeSheetId {
  if (typeof window === "undefined") return "all";
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return "all";
    return raw === "all" || raw.length > 0 ? raw : "all";
  } catch {
    return "all";
  }
}

export function saveHomeSheetId(id: HomeSheetId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}
