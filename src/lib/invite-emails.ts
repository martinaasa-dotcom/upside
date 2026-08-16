const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_INVITE_EMAILS = 20;

export function parseInviteEmails(raw: string | null | undefined): {
  emails: string[];
  invalid: string[];
} {
  const parts = String(raw ?? "")
    .split(/[,;\n]+|\s+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const emails: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    if (!EMAIL_RE.test(part)) {
      invalid.push(part);
      continue;
    }
    if (seen.has(part)) continue;
    seen.add(part);
    emails.push(part);
  }
  return { emails, invalid };
}

export function inviteEmailAllowlist(
  raw: string | null | undefined
): { ok: true; emails: string[] } | { ok: false; error: string } {
  const { emails, invalid } = parseInviteEmails(raw);
  if (invalid.length > 0) {
    return { ok: false, error: "Those email addresses do not look right." };
  }
  if (emails.length > MAX_INVITE_EMAILS) {
    return {
      ok: false,
      error: `Keep it to ${MAX_INVITE_EMAILS} emails on one invite.`,
    };
  }
  return { ok: true, emails };
}

export function storeInviteEmails(emails: string[]): string | null {
  return emails.length > 0 ? emails.join(",") : null;
}
