import { fetchQuotesWithFallback } from "@/lib/market/quotes";
import {
  buildCloseEmailText,
  buildMorningEmailText,
  buildSundayEmailText,
} from "@/lib/morning-email";
import { noteEmailConfigured, sendNoteEmail } from "@/lib/send-note";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export type NoteKind = "morning" | "close" | "sunday";

const SUBJECT: Record<NoteKind, string> = {
  morning: "Your book this morning",
  close: "After the close",
  sunday: "Sunday look",
};

export async function dispatchOptedInNotes(kind: NoteKind): Promise<{
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
    .eq("morning_note", true);
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

  const emailed = noteEmailConfigured();
  if (!emailed) {
    return {
      ok: true,
      sent: 0,
      skipped: (profiles ?? []).length,
      optedIn: (profiles ?? []).length,
      emailed: false,
    };
  }
  let sent = 0;
  let skipped = 0;
  for (const profile of profiles ?? []) {
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
      .select("id, cash_balance")
      .in("id", ids);
    const { data: rows } = await supabase
      .from(PORTFELL_TABLES.holdings)
      .select("ticker, shares, buy_price")
      .in("portfolio_id", ids);
    const holdings = (rows ?? []).map((h) => ({
      ticker: String(h.ticker ?? "").toUpperCase(),
      shares: Number(h.shares ?? 0),
      buy_price: Number(h.buy_price ?? 0),
    }));
    const tickers = [...new Set(holdings.map((h) => h.ticker))].filter(Boolean);
    const quotes =
      tickers.length > 0
        ? (await fetchQuotesWithFallback(tickers)).quotes
        : {};
    const cash = (books ?? []).reduce(
      (s, p) => s + Number(p.cash_balance ?? 0),
      0
    );
    const payload = {
      name: profile.display_name as string | null,
      cash,
      holdings,
      quotes,
    };
    const text =
      kind === "close"
        ? buildCloseEmailText(payload)
        : kind === "sunday"
          ? buildSundayEmailText(payload)
          : buildMorningEmailText(payload);
    const ok = await sendNoteEmail({
      to: email,
      subject: SUBJECT[kind],
      text,
    });
    if (ok) sent += 1;
    else skipped += 1;
  }

  return {
    ok: true,
    sent,
    skipped,
    optedIn: (profiles ?? []).length,
    emailed,
  };
}
