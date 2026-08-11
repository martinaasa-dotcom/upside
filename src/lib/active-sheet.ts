/** Persist which portfolio tab is active across reloads. */

export const ACTIVE_SHEET_KEY = "upside-active-sheet-id";

export function loadActiveSheetId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_SHEET_KEY);
  } catch {
    return null;
  }
}

export function saveActiveSheetId(id: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_SHEET_KEY, id);
  } catch {
    /* ignore */
  }
}
