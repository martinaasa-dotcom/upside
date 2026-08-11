/** Hard-coded Upside superadmins (ops / product owners). */
export const SUPERADMIN_EMAILS = [
  "martin.aasa@upthink.ee",
  "aasamartinaasa@gmail.com",
] as const;

export function isSuperadminEmail(
  email: string | null | undefined
): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (SUPERADMIN_EMAILS as readonly string[]).includes(normalized);
}
