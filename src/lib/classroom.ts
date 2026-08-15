import type { SupabaseClient } from "@supabase/supabase-js";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export const CLASSROOM_KIND = "classroom" as const;
export const CIRCLE_KIND = "circle" as const;
export type CommunityKind = typeof CIRCLE_KIND | typeof CLASSROOM_KIND;

export const DEFAULT_STARTING_CASH = 100_000;
export const MIN_STARTING_CASH = 1_000;
export const MAX_STARTING_CASH = 10_000_000;

export const DEFAULT_CLASS_ASSIGNMENT =
  "Week 1: pick up to 5 names and write why on each. The Sunday note is the recap you turn in.";

export type ThesisCoverage = {
  names: number;
  withWhy: number;
};

export function isClassroomKind(kind: unknown): boolean {
  return kind === CLASSROOM_KIND;
}

export function parseStartingCash(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < MIN_STARTING_CASH || rounded > MAX_STARTING_CASH) return null;
  return rounded;
}

export function countTheses(
  tickers: string[],
  conviction: Record<string, { thesis?: string } | undefined> | null | undefined
): ThesisCoverage {
  const names = new Set(
    tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)
  );
  let withWhy = 0;
  for (const ticker of names) {
    const thesis = conviction?.[ticker]?.thesis?.trim();
    if (thesis) withWhy += 1;
  }
  return { names: names.size, withWhy };
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "sheet";
}

function sheetLabel(displayName: string | null, email: string | null, className: string) {
  const fromName = displayName?.trim().split(/\s+/)[0];
  const fromEmail = email?.split("@")[0]?.trim();
  const first = fromName || fromEmail || "Student";
  return `${first} · ${className}`.slice(0, 80);
}

async function uniqueSlug(
  supabase: SupabaseClient,
  name: string
): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let suffix = 1;
  for (;;) {
    const { data } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

export async function provisionClassroomSheet(
  supabase: SupabaseClient,
  opts: { communityId: string; userId: string }
): Promise<{ ok: true; portfolioId: string } | { ok: false; error: string }> {
  const { data: community, error: cErr } = await supabase
    .from(PORTFELL_TABLES.communities)
    .select("id, name, kind, starting_cash")
    .eq("id", opts.communityId)
    .maybeSingle();
  if (cErr) return { ok: false, error: cErr.message };
  if (!community) return { ok: false, error: "Not found" };
  if (!isClassroomKind((community as { kind?: string }).kind)) {
    return { ok: false, error: "Not a class" };
  }

  const { data: membership } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .select("user_id")
    .eq("community_id", opts.communityId)
    .eq("user_id", opts.userId)
    .maybeSingle();
  if (!membership) return { ok: false, error: "Not a member" };

  const { data: existing } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("id, name")
    .eq("classroom_community_id", opts.communityId)
    .eq("owner_id", opts.userId)
    .maybeSingle();

  const startingCash = parseStartingCash(
    (community as { starting_cash?: unknown }).starting_cash
  ) ?? DEFAULT_STARTING_CASH;

  let portfolioId = (existing as { id?: string } | null)?.id ?? null;
  let label = (existing as { name?: string } | null)?.name ?? null;

  if (!portfolioId) {
    const { data: profile } = await supabase
      .from(PORTFELL_TABLES.profiles)
      .select("display_name, email")
      .eq("id", opts.userId)
      .maybeSingle();
    const name = sheetLabel(
      (profile as { display_name?: string | null } | null)?.display_name ?? null,
      (profile as { email?: string | null } | null)?.email ?? null,
      (community as { name: string }).name
    );
    const slug = await uniqueSlug(supabase, name);
    const { data: owned } = await supabase
      .from(PORTFELL_TABLES.portfolioOwners)
      .select("portfolio_id")
      .eq("user_id", opts.userId);
    const sortOrder = ((owned ?? []) as unknown[]).length + 1;

    const { data: created, error: pErr } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .insert({
        name,
        slug,
        sort_order: sortOrder,
        cash_balance: startingCash,
        owner_id: opts.userId,
        classroom_community_id: opts.communityId,
      })
      .select("id, name")
      .single();
    if (pErr || !created) {
      if (pErr && /duplicate|unique/i.test(pErr.message)) {
        const { data: raced } = await supabase
          .from(PORTFELL_TABLES.portfolios)
          .select("id, name")
          .eq("classroom_community_id", opts.communityId)
          .eq("owner_id", opts.userId)
          .maybeSingle();
        if (raced) {
          portfolioId = (raced as { id: string }).id;
          label = (raced as { name: string }).name;
        } else {
          return { ok: false, error: pErr.message };
        }
      } else {
        return { ok: false, error: pErr?.message ?? "Couldn't make the paper sheet." };
      }
    } else {
      portfolioId = (created as { id: string }).id;
      label = (created as { name: string }).name;
    }

    const { error: oErr } = await supabase
      .from(PORTFELL_TABLES.portfolioOwners)
      .insert({ portfolio_id: portfolioId, user_id: opts.userId });
    if (oErr && !/duplicate|unique/i.test(oErr.message)) {
      return { ok: false, error: oErr.message };
    }
  }

  const { error: pinErr } = await supabase
    .from(PORTFELL_TABLES.communityPortfolios)
    .insert({
      community_id: opts.communityId,
      portfolio_id: portfolioId,
      label,
    });
  if (pinErr && !/duplicate|unique/i.test(pinErr.message)) {
    return { ok: false, error: pinErr.message };
  }

  return { ok: true, portfolioId };
}
