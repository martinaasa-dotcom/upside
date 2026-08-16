/** Persist which portfolio tab is active across reloads. */

export const ACTIVE_SHEET_KEY = "upside-active-sheet-id";
/** One-shot: Circle dock clicked Pulse, Next dropped ?tab=, still land there. */
export const OPEN_TAB_KEY = "upside-open-tab";

export function stashOpenTab(tab: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(OPEN_TAB_KEY, tab);
  } catch {
    /* ignore */
  }
}

export function takeOpenTab(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(OPEN_TAB_KEY);
    if (value) sessionStorage.removeItem(OPEN_TAB_KEY);
    return value;
  } catch {
    return null;
  }
}

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
