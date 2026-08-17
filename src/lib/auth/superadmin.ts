/** Hard-coded Upside superadmins (ops / product owners). */
export const SUPERADMIN_EMAILS = [
  "martin.aasa@upthink.ee",
  "aasamartinaasa@gmail.com",
] as const;

/** Inbox notes go to the first connected email only. */
export const SUPERADMIN_NOTE_EMAIL = SUPERADMIN_EMAILS[0];

export function isSuperadminEmail(
  email: string | null | undefined
): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (SUPERADMIN_EMAILS as readonly string[]).includes(normalized);
}
