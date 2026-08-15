import { requireCronAuth } from "@/lib/cron-auth";
import { buildMorningEmailText } from "@/lib/morning-email";
import { fetchQuotesWithFallback } from "@/lib/market/quotes";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function sendResend(to: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.RESEND_FROM?.trim() || "Upside Lab <notes@upsidelab.app>";
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Book this morning",
      text,
    }),
  });
  return res.ok;
}

export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  if (!supabaseUsesServiceRole()) {
    return NextResponse.json(
      { error: "Morning note skipped. Service role is not configured." },
      { status: 503 }
    );
  }
  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { data: profiles, error } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("id, email, display_name")
    .eq("morning_note", true);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    const text = buildMorningEmailText({
      name: profile.display_name,
      cash,
      holdings,
      quotes,
    });
    const ok = await sendResend(email, text);
    if (ok) sent += 1;
    else skipped += 1;
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    optedIn: (profiles ?? []).length,
    emailed: Boolean(process.env.RESEND_API_KEY?.trim()),
  });
}
