/** One-time nudge when someone signs up and never imports a name. */

import { isClassroomSheet } from "@/lib/classroom";
import {
  collapseMailRecipients,
  connectedEmailsFor,
  loadAliasMap,
} from "@/lib/auth/identity";
import { emptyBookNudgeHtml } from "@/lib/email-letter";
import { PRODUCT_NAME, PRODUCT_ORIGIN } from "@/lib/product";
import { noteEmailConfigured, sendNoteEmail } from "@/lib/send-note";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export const EMPTY_BOOK_NUDGE_AFTER_DAYS = 7;
export const EMPTY_BOOK_NUDGE_BATCH = 40;

const DAY_MS = 24 * 60 * 60 * 1000;

export function hasLiveHoldings(
  rows: { ticker?: string | null; shares?: number | null }[]
): boolean {
  return rows.some(
    (h) => String(h.ticker ?? "").trim() && Number(h.shares) > 0
  );
}

export function isEmptyBookNudgeDue(input: {
  createdAt: string | Date;
  sentAt: string | Date | null | undefined;
  now?: Date;
}): boolean {
  if (input.sentAt) return false;
  const created = new Date(input.createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  const now = (input.now ?? new Date()).getTime();
  return now - created >= EMPTY_BOOK_NUDGE_AFTER_DAYS * DAY_MS;
}

export function shouldSkipEmptyBookNudge(input: {
  hasClassroomSheet: boolean;
  hasLiveHoldings: boolean;
}): boolean {
  return input.hasClassroomSheet || input.hasLiveHoldings;
}

function firstName(displayName: string | null | undefined): string | null {
  const first = String(displayName ?? "")
    .trim()
    .split(/\s+/)[0];
  if (!first || first.length < 2 || first.length > 24) return null;
  if (!/^[\p{L}'’-]+$/u.test(first)) return null;
  return first;
}

export function emptyBookNudgeSubject(): string {
  return "Your portfolio is still empty";
}

export function emptyBookNudgeText(
  displayName: string | null | undefined
): string {
  const hi = firstName(displayName);
  const greeting = hi ? `Hi ${hi}.` : "Hi.";
  return [
    "Your portfolio is still empty.",
    greeting,
    "You signed up about a week ago, and there are still no names in your portfolio.",
    `${PRODUCT_NAME} is a morning read of the names you own. Paste what you hold. The app watches the prices, flags a name when it jumps, and lets you ask Margus if the reason you own it still holds.`,
    "Getting started is one step. Import the names you already own. A CSV, a screenshot, or type them in. That is the whole start.",
    PRODUCT_ORIGIN,
    "This is a one-time note. Weekday and Sunday emails start once there are names in your portfolio. You can turn notes off in Account: https://upsidelab.app/account",
  ].join("\n\n");
}

export async function dispatchEmptyBookNudges(): Promise<{
  ok: boolean;
  sent: number;
  skipped: number;
  candidates: number;
  emailed: boolean;
  error?: string;
  status?: number;
}> {
  if (!supabaseUsesServiceRole()) {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      candidates: 0,
      emailed: false,
      error: "Empty-book nudge skipped. Service role is not configured.",
      status: 503,
    };
  }
  const supabase = getSupabaseServer();
  if (!supabase) {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      candidates: 0,
      emailed: false,
      error: "Supabase not configured",
      status: 400,
    };
  }

  const cutoff = new Date(
    Date.now() - EMPTY_BOOK_NUDGE_AFTER_DAYS * DAY_MS
  ).toISOString();
  const { data: profiles, error } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("id, email, display_name, created_at, empty_book_nudge_sent_at")
    .is("empty_book_nudge_sent_at", null)
    .lte("created_at", cutoff)
    .not("email", "is", null)
    .order("created_at", { ascending: true })
    .limit(EMPTY_BOOK_NUDGE_BATCH);
  if (error) {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      candidates: 0,
      emailed: false,
      error: error.message,
      status: 500,
    };
  }

  const emailed = noteEmailConfigured();
  if (!emailed) {
    return {
      ok: true,
      sent: 0,
      skipped: (profiles ?? []).length,
      candidates: (profiles ?? []).length,
      emailed: false,
    };
  }

  const aliasMap = await loadAliasMap(supabase);
  const recipients = collapseMailRecipients(profiles ?? [], aliasMap);

  let sent = 0;
  let skipped = 0;
  for (const { to: email, profile } of recipients) {
    if (
      !email ||
      !isEmptyBookNudgeDue({
        createdAt: profile.created_at as string,
        sentAt: profile.empty_book_nudge_sent_at as string | null,
      })
    ) {
      skipped += 1;
      continue;
    }

    const { data: owns } = await supabase
      .from(PORTFELL_TABLES.portfolioOwners)
      .select("portfolio_id")
      .eq("user_id", profile.id);
    const ids = (owns ?? []).map((o) => o.portfolio_id as string);

    let hasClassroom = false;
    let live = false;
    if (ids.length > 0) {
      const { data: books } = await supabase
        .from(PORTFELL_TABLES.portfolios)
        .select("id, classroom_community_id")
        .in("id", ids);
      hasClassroom = (books ?? []).some((p) =>
        isClassroomSheet({
          classroom_community_id: p.classroom_community_id as string | null,
        })
      );
      const { data: rows } = await supabase
        .from(PORTFELL_TABLES.holdings)
        .select("ticker, shares")
        .in("portfolio_id", ids);
      live = hasLiveHoldings(
        (rows ?? []) as { ticker?: string | null; shares?: number | null }[]
      );
    }

    if (shouldSkipEmptyBookNudge({ hasClassroomSheet: hasClassroom, hasLiveHoldings: live })) {
      skipped += 1;
      continue;
    }

    const text = emptyBookNudgeText(profile.display_name as string | null);
    const ok = await sendNoteEmail({
      to: email,
      subject: emptyBookNudgeSubject(),
      text,
      html: emptyBookNudgeHtml(text),
    });
    if (!ok) {
      skipped += 1;
      continue;
    }
    const { error: markErr } = await supabase
      .from(PORTFELL_TABLES.profiles)
      .update({ empty_book_nudge_sent_at: new Date().toISOString() })
      .in("email", connectedEmailsFor(email, aliasMap));
    if (markErr) {
      skipped += 1;
      continue;
    }
    sent += 1;
  }

  return {
    ok: true,
    sent,
    skipped,
    candidates: (profiles ?? []).length,
    emailed,
  };
}
