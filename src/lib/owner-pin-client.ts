/** Browser-safe constants + session PIN cache for shared-book writes. */

export const OWNER_PIN_HEADER = "x-upside-owner-pin";
export const OWNER_PORTFOLIO_HEADER = "x-upside-portfolio-id";
const SESSION_PIN_KEY = "upside-owner-pin-session";
export const ACTIVE_SHEET_KEY = "upside-active-sheet-id";

export function getSessionPin(): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(SESSION_PIN_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function setSessionPin(pin: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_PIN_KEY, pin.trim());
  } catch {
    /* ignore */
  }
}

export function clearSessionPin() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_PIN_KEY);
  } catch {
    /* ignore */
  }
}

/** Headers for mutating API calls (includes PIN when unlocked). */
export function ownerPinHeaders(
  pin?: string,
  extra?: Record<string, string>,
  portfolioId?: string | null
): Record<string, string> {
  const value = (pin ?? getSessionPin()).trim();
  const headers: Record<string, string> = { ...(extra ?? {}) };
  if (value) headers[OWNER_PIN_HEADER] = value;
  if (portfolioId) headers[OWNER_PORTFOLIO_HEADER] = portfolioId;
  return headers;
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
