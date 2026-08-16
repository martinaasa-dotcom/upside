import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import type { SupabaseClient } from "@supabase/supabase-js";

export const KARUD_PRIMARY_EMAIL = "rasmusmarjapuu@gmail.com";
export const KARUD_ALIAS_EMAIL = "karukaroliine99@gmail.com";

/** Seed emails that claim a household sheet on first Google sign-in. */
export const SEED_EMAIL_SLUGS: Record<string, string[]> = {
  [KARUD_PRIMARY_EMAIL]: ["karud"],
  [KARUD_ALIAS_EMAIL]: ["karud"],
  "liinaanette@gmail.com": ["lap"],
};

/** Pending Circle households before every owner has signed in. */
export const HOUSEHOLD_PENDING_EMAILS: Record<string, string[]> = {
  karud: [KARUD_PRIMARY_EMAIL, KARUD_ALIAS_EMAIL],
  lap: ["liinaanette@gmail.com"],
};

/**
 * Hard-coded fallback matching migration 016.
 * Martin's two Google logins are one person. Rasmus and Karoliine are
 * two people who share Karud, like Martin and Amanda share Aasad.
 * Prefer DB (`portfell_account_aliases`) when readable.
 */
export const ACCOUNT_ALIAS_FALLBACK: Record<string, string> = {
  "aasamartinaasa@gmail.com": "martin.aasa@upthink.ee",
};

/** First word of a display name. "Rasmus-Richard Marjapuu" -> "Rasmus". */
export function givenName(full: string): string {
  const first = full.trim().split(/\s+/).find(Boolean) ?? "";
  return first.split("-")[0] || first;
}

/** "Martin Aasa" + "Amanda Aasa" -> "Martin and Amanda Aasa".
 * Different surnames: "Rasmus and Karoliine". */
export function combineHouseholdNames(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "Household";

  const parts = clean.map((n) => n.split(/\s+/).filter(Boolean));
  const lastWords = parts.map((p) => p[p.length - 1] ?? "");
  const sameSurname =
    Boolean(lastWords[0]) && lastWords.every((w) => w === lastWords[0]);
  const given = clean.map(givenName);
  const last = given[given.length - 1]!;

  if (given.length === 2) {
    return sameSurname && parts.every((p) => p.length > 1)
      ? `${given[0]} and ${given[1]} ${lastWords[0]}`
      : `${given[0]} and ${given[1]}`;
  }

  const head = given.slice(0, -1).join(", ");
  if (sameSurname && parts.every((p) => p.length > 1)) {
    return `${head}, and ${last} ${lastWords[0]}`;
  }
  return `${head}, and ${last}`;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return e || null;
}

export function primaryEmailFromMap(
  email: string | null | undefined,
  aliasToPrimary: Record<string, string> = ACCOUNT_ALIAS_FALLBACK
): string | null {
  const e = normalizeEmail(email);
  if (!e) return null;
  return aliasToPrimary[e] ?? e;
}

export async function loadAliasMap(
  supabase: SupabaseClient | null
): Promise<Record<string, string>> {
  const map = { ...ACCOUNT_ALIAS_FALLBACK };
  if (!supabase) return map;
  try {
    const { data } = await supabase
      .from(PORTFELL_TABLES.accountAliases)
      .select("alias_email, primary_email");
    for (const row of (data ?? []) as {
      alias_email: string;
      primary_email: string;
    }[]) {
      const a = normalizeEmail(row.alias_email);
      const p = normalizeEmail(row.primary_email);
      if (a && p) map[a] = p;
    }
  } catch {
    /* table may not exist yet locally */
  }
  return map;
}

export type ProfileLike = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
};

export type RawMember = {
  user_id: string;
  role: string;
  joined_at: string;
  profile: ProfileLike | null;
};

export type PersonMember = {
  /** Canonical user id for UI selection (primary email's profile when present). */
  person_id: string;
  user_ids: string[];
  emails: string[];
  role: string;
  joined_at: string;
  profile: ProfileLike | null;
  is_you: boolean;
};

/** Collapse alias logins into one community person. */
export function collapseMembersByAlias(
  members: RawMember[],
  viewerUserId: string | null,
  aliasToPrimary: Record<string, string> = ACCOUNT_ALIAS_FALLBACK
): PersonMember[] {
  type Acc = {
    personKey: string;
    user_ids: string[];
    emails: string[];
    role: string;
    joined_at: string;
    profiles: ProfileLike[];
  };

  const byKey = new Map<string, Acc>();

  for (const m of members) {
    const email = normalizeEmail(m.profile?.email);
    const personKey = email
      ? primaryEmailFromMap(email, aliasToPrimary) ?? email
      : m.user_id;

    const existing = byKey.get(personKey);
    if (!existing) {
      byKey.set(personKey, {
        personKey,
        user_ids: [m.user_id],
        emails: email ? [email] : [],
        role: m.role,
        joined_at: m.joined_at,
        profiles: m.profile ? [m.profile] : [],
      });
      continue;
    }

    if (!existing.user_ids.includes(m.user_id)) {
      existing.user_ids.push(m.user_id);
    }
    if (email && !existing.emails.includes(email)) {
      existing.emails.push(email);
    }
    if (m.role === "admin") existing.role = "admin";
    if (m.joined_at < existing.joined_at) existing.joined_at = m.joined_at;
    if (m.profile) existing.profiles.push(m.profile);
  }

  const people: PersonMember[] = [];
  for (const acc of byKey.values()) {
    const primaryEmail = acc.personKey.includes("@") ? acc.personKey : null;
    const primaryProfile =
      (primaryEmail
        ? acc.profiles.find(
            (p) => normalizeEmail(p.email) === primaryEmail
          )
        : null) ??
      acc.profiles[0] ??
      null;

    const personId =
      primaryProfile?.id ??
      acc.user_ids.find((id) =>
        acc.profiles.some(
          (p) => p.id === id && normalizeEmail(p.email) === primaryEmail
        )
      ) ??
      acc.user_ids[0];

    people.push({
      person_id: personId,
      user_ids: acc.user_ids,
      emails: acc.emails,
      role: acc.role,
      joined_at: acc.joined_at,
      profile: primaryProfile,
      is_you: Boolean(
        viewerUserId && acc.user_ids.includes(viewerUserId)
      ),
    });
  }

  people.sort((a, b) => {
    if (a.role === "admin" && b.role !== "admin") return -1;
    if (b.role === "admin" && a.role !== "admin") return 1;
    const an = a.profile?.display_name || a.emails[0] || "";
    const bn = b.profile?.display_name || b.emails[0] || "";
    return an.localeCompare(bn);
  });

  return people;
}

export type PendingHousehold = {
  key: string;
  label: string;
  portfolio_ids: string[];
  emails: string[];
};

/** Expand a selected person_id to all linked auth user ids. */
export function expandPersonUserIds(
  personId: string,
  people: PersonMember[]
): string[] {
  const person = people.find(
    (p) => p.person_id === personId || p.user_ids.includes(personId)
  );
  return person?.user_ids ?? [personId];
}
