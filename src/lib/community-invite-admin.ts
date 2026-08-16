export type InviteAdminPerson = {
  id: string;
  name: string;
};

export type InviteAdminUse = {
  id: string;
  name: string;
  used_at: string;
};

export type InviteAdminStatus = "live" | "expired" | "retired";

export type InviteAdminRow = {
  id: string;
  hint: string | null;
  email: string | null;
  role: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  created_by: InviteAdminPerson | null;
  uses: number;
  used_by: InviteAdminUse[];
  status: InviteAdminStatus;
};

export function tokenHintFromToken(token: string): string {
  return token.slice(-6);
}

export function inviteAdminStatus(
  row: { revoked_at: string | null; expires_at: string | null },
  now = Date.now()
): InviteAdminStatus {
  if (row.revoked_at) return "retired";
  if (row.expires_at && new Date(row.expires_at).getTime() < now) {
    return "expired";
  }
  return "live";
}

export function profileLabel(
  p: { display_name?: string | null; email?: string | null } | null | undefined
): string {
  const name = p?.display_name?.trim();
  if (name) return name;
  const email = p?.email?.trim();
  if (email) return email;
  return "Someone";
}

export function inviteUsesLabel(n: number): string {
  if (n <= 0) return "Never used";
  if (n === 1) return "Used once";
  return `Used ${n} times`;
}

export function inviteLockLabel(email: string | null): string {
  if (!email) return "Anyone with the link";
  const parts = email
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 1) return parts[0];
  return `Locked to ${parts.length} emails`;
}

export function inviteDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
