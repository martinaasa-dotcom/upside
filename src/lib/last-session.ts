/** Last signed-in user, so the gate can skip "Checking sign-in" on refresh. */

const KEY = "upside-last-user-v1";

export type LastUser = { id: string; email: string | null };

export function loadLastUser(): LastUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastUser | null;
    if (!parsed?.id || typeof parsed.id !== "string") return null;
    return {
      id: parsed.id,
      email: typeof parsed.email === "string" ? parsed.email : null,
    };
  } catch {
    return null;
  }
}

export function saveLastUser(user: LastUser | null) {
  if (typeof window === "undefined") return;
  try {
    if (!user) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(user));
  } catch {
    /* ignore quota / private mode */
  }
}
