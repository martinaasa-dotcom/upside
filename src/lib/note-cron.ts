import {
  collapseMailRecipients,
  emailMatchesAllowlist,
  loadAliasMap,
} from "@/lib/auth/identity";
import { SUPERADMIN_NOTE_EMAIL } from "@/lib/auth/superadmin";
import { sheetCashBalance } from "@/lib/cash-balance";
import { ownedBookPortfolios } from "@/lib/classroom";
import { hasLiveHoldings } from "@/lib/empty-book-nudge";
import { fetchQuotesWithFallback } from "@/lib/market/quotes";
import { fetchMarketEvents, fetchWeekReturns } from "@/lib/market/yahoo";
import {
  buildWeeklyLetter,
  parseConviction,
  weeklyLetterHtml,
  weeklyLetterText,
  weeklySubject,
} from "@/lib/weekly-letter";
import { sanitizeWatchlist } from "@/lib/lab-bundle";
import { writeWeeklyTake } from "@/lib/weekly-margus";
import { noteEmailConfigured, sendNoteEmail } from "@/lib/send-note";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export type NoteDispatchOpts = {
  /** When set, only these addresses get a note. Scheduled cron leaves this off. */
  onlyEmails?: readonly string[];
};

/** Vercel Cron still mails everyone opted in. A manual hit stays on Martin. */
export function noteTestAudience(req: Request): NoteDispatchOpts {
  const only = new URL(req.url).searchParams.get("only")?.trim().toLowerCase();
  if (only === "me") return { onlyEmails: [SUPERADMIN_NOTE_EMAIL] };
  if (req.headers.get("x-vercel-cron") === "1") return {};
  return { onlyEmails: [SUPERADMIN_NOTE_EMAIL] };
}

/** The Sunday letter is the only scheduled email, so there is no kind. */
export async function dispatchWeeklyLetters(
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

  const { data: profiles, error } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("id, email, display_name")
    .eq("note_sunday", true);
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

  const aliasMap = await loadAliasMap(supabase);
  const allow = (opts.onlyEmails ?? []).map((e) => e.trim().toLowerCase());
  const allowSet = new Set(allow.filter(Boolean));
  const recipients = collapseMailRecipients(
    (profiles ?? []).filter((profile) =>
      emailMatchesAllowlist(profile.email, allowSet, aliasMap)
    ),
    aliasMap
  );

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
  for (const { to: email, profile } of recipients) {
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
    const { data: bookRows } = await supabase
      .from(PORTFELL_TABLES.portfolios)
      .select("id, cash_balance, classroom_community_id")
      .in("id", ids);
    const books = (bookRows ?? []) as {
      id: string;
      cash_balance: number;
      classroom_community_id?: string | null;
    }[];
    const noteBooks = ownedBookPortfolios(books);
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
      tickers.length > 0 ? await fetchWeekReturns(tickers) : undefined;
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
      .select("conviction, watchlist")
      .eq("owner_id", profile.id)
      .maybeSingle();

    // Watchlist names are quoted separately: they are not held, so they
    // never reach the holdings fetch above.
    const held = new Set(tickers);
    const watchlist = sanitizeWatchlist(lab?.watchlist).filter(
      (t) => !held.has(t)
    );
    const watchQuotes =
      watchlist.length > 0
        ? (await fetchQuotesWithFallback(watchlist)).quotes
        : {};
    const watchWeekReturns =
      watchlist.length > 0 ? await fetchWeekReturns(watchlist) : undefined;

    // One calendar call covering everything the letter can mention.
    const calendarTickers = [...new Set([...tickers, ...watchlist])];
    const earnings =
      calendarTickers.length > 0
        ? (await fetchMarketEvents(calendarTickers)).earnings
        : undefined;

    const letter = buildWeeklyLetter({
      name: profile.display_name as string | null,
      cash,
      holdings,
      quotes,
      conviction: parseConviction(lab?.conviction),
      weekReturns,
      earnings,
      watchlist,
      watchQuotes,
      watchWeekReturns,
    });
    letter.margus = await writeWeeklyTake(letter);
    const ok = await sendNoteEmail({
      to: email,
      subject: weeklySubject(letter),
      text: weeklyLetterText(letter),
      html: weeklyLetterHtml(letter),
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
