const KEY_PREFIX = "portfell-invite-nudge-v1:";

function key(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function loadInviteNudgeDismissed(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key(userId)) === "1";
  } catch {
    return false;
  }
}

export function saveInviteNudgeDismissed(userId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(userId), "1");
  } catch {
    /* ignore quota / private mode */
  }
}
