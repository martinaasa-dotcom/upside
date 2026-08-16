import { SUPERADMIN_EMAILS } from "@/lib/auth/superadmin";
import { sheetCashBalance } from "@/lib/cash-balance";
import { realBookPortfolios } from "@/lib/classroom";
import { hasLiveHoldings } from "@/lib/empty-book-nudge";
import { fetchQuotesWithFallback } from "@/lib/market/quotes";
import { fetchMarketEvents, fetchWeekReturns } from "@/lib/market/yahoo";
import {
  buildNoteReport,
  noteReportHtml,
  noteReportText,
  noteSubject,
  parseConviction,
  type NoteKind,
} from "@/lib/note-report";
import { writeMargusNoteTake } from "@/lib/note-margus";
import { noteEmailConfigured, sendNoteEmail } from "@/lib/send-note";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export type { NoteKind };

export type NoteDispatchOpts = {
  /** When set, only these addresses get a note. Scheduled cron leaves this off. */
  onlyEmails?: readonly string[];
};

/** Vercel Cron still mails everyone opted in. A manual hit stays on Martin. */
export function noteTestAudience(req: Request): NoteDispatchOpts {
  const only = new URL(req.url).searchParams.get("only")?.trim().toLowerCase();
  if (only === "me") return { onlyEmails: SUPERADMIN_EMAILS };
  if (req.headers.get("x-vercel-cron") === "1") return {};
  return { onlyEmails: SUPERADMIN_EMAILS };
}

export async function dispatchOptedInNotes(
  kind: NoteKind,
  opts: NoteDispatchOpts = {}
): Promise<{
  ok: boolean;
  sent: number;
  skipped: number;
  optedIn: number;
  emailed: boolean;
  error?: string;
  status?: number;
}> {
  if (!supabaseUsesServiceRole()) {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      optedIn: 0,
      emailed: false,
      error: "Note skipped. Service role is not configured.",
      status: 503,
    };
  }
  const supabase = getSupabaseServer();
  if (!supabase) {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      optedIn: 0,
      emailed: false,
      error: "Supabase not configured",
      status: 400,
    };
  }

  const flag = kind === "sunday" ? "note_sunday" : "note_morning";
  const { data: profiles, error } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("id, email, display_name")
    .eq(flag, true);
  if (error) {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      optedIn: 0,
      emailed: false,
      error: error.message,
      status: 500,
    };
  }

  const allow = (opts.onlyEmails ?? []).map((e) => e.trim().toLowerCase());
  const allowSet = new Set(allow.filter(Boolean));
  const recipients = (profiles ?? []).filter((profile) => {
    if (allowSet.size === 0) return true;
    const email = String(profile.email ?? "").trim().toLowerCase();
    return allowSet.has(email);
  });

  const emailed = noteEmailConfigured();
  if (!emailed) {
    return {
      ok: true,
      sent: 0,
      skipped: recipients.length,
      optedIn: recipients.length,
      emailed: false,
    };
  }
  let sent = 0;
  let skipped = 0;
  for (const profile of recipients) {
    const email = String(profile.email ?? "").trim();
    if (!email) {
      skipped += 1;
      continue;
    }
    const { data: owns } = await supabase
      .from(PORTFELL_TABLES.portfolioOwners)
      .select("portfolio_id")
      .eq("user_id", profile.id);
    const ids = (owns ?? []).map((o) => o.portfolio_id as string);
    if (ids.length === 0) {
      skipped += 1;
      continue;
    }
    const { data: books } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .select("id, cash_balance, classroom_community_id")
      .in("id", ids);
    const noteBooks = realBookPortfolios(
      (books ?? []) as {
        id: string;
        cash_balance: number;
        classroom_community_id?: string | null;
      }[]
    );
    const noteIds = new Set(
      (noteBooks as { id: string }[]).map((p) => p.id)
    );
    if (noteIds.size === 0) {
      skipped += 1;
      continue;
    }
    const { data: rows } = await supabase
      .from(PORTFELL_TABLES.holdings)
      .select("ticker, shares, buy_price, portfolio_id")
      .in("portfolio_id", [...noteIds]);
    const holdings = (rows ?? []).map((h) => ({
      ticker: String(h.ticker ?? "").toUpperCase(),
      shares: Number(h.shares ?? 0),
      buy_price: Number(h.buy_price ?? 0),
    }));
    if (!hasLiveHoldings(holdings)) {
      skipped += 1;
      continue;
    }
    const tickers = [...new Set(holdings.map((h) => h.ticker))].filter(Boolean);
    const quotes =
      tickers.length > 0
        ? (await fetchQuotesWithFallback(tickers)).quotes
        : {};
    const weekReturns =
      kind === "sunday" && tickers.length > 0
        ? await fetchWeekReturns(tickers)
        : undefined;
    const earnings =
      (kind === "morning" || kind === "sunday") && tickers.length > 0
        ? (await fetchMarketEvents(tickers)).earnings
        : undefined;
    const cash = (
      noteBooks as {
        cash_balance?: number;
        classroom_community_id?: string | null;
      }[]
    ).reduce((s, p) => s + sheetCashBalance({
      cash_balance: Number(p.cash_balance ?? 0),
      classroom_community_id: p.classroom_community_id,
    }), 0);
    const { data: lab } = await supabase
      .from(PORTFELL_TABLES.labState)
      .select("conviction")
      .eq("owner_id", profile.id)
      .maybeSingle();
    const report = buildNoteReport({
      kind,
      name: profile.display_name as string | null,
      cash,
      holdings,
      quotes,
      conviction: parseConviction(lab?.conviction),
      weekReturns,
      earnings,
    });
    report.margus = await writeMargusNoteTake(report);
    const ok = await sendNoteEmail({
      to: email,
      subject: noteSubject(report),
      text: noteReportText(report),
      html: noteReportHtml(report),
    });
    if (ok) sent += 1;
    else skipped += 1;
  }

  return {
    ok: true,
    sent,
    skipped,
    optedIn: recipients.length,
    emailed,
  };
}
