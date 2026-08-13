import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { fetchQuotesWithFallback } from "@/lib/market/quotes";
import {
  fundDayNumber,
  liveFundTodayMove,
  liveFundTotalValue,
} from "@/lib/margus-fund-mark";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Small card for Overview. Same live mark as the Fund page, without
 * dragging sixty reports across the wire.
 */
export async function GET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const [
    { data: fund, error: fundErr },
    { data: holdings, error: holdingsErr },
    { data: latestReport, error: reportErr },
  ] = await Promise.all([
    supabase.from(PORTFELL_TABLES.margusFund).select("*").eq("id", "main").maybeSingle(),
    supabase
      .from(PORTFELL_TABLES.margusFundHoldings)
      .select("ticker, shares, cost_basis, status")
      .eq("status", "open"),
    supabase
      .from(PORTFELL_TABLES.margusFundReports)
      .select("headline, portfolio_value, cash, report_date")
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (fundErr) return NextResponse.json({ error: fundErr.message }, { status: 500 });
  if (holdingsErr) {
    return NextResponse.json({ error: holdingsErr.message }, { status: 500 });
  }
  if (reportErr) {
    return NextResponse.json({ error: reportErr.message }, { status: 500 });
  }

  const openHoldings = (holdings ?? []) as {
    ticker: string;
    shares: number;
    cost_basis: number;
    status: string;
  }[];
  const tickers = openHoldings.map((h) => h.ticker);
  const { quotes } = await fetchQuotesWithFallback(tickers);

  const cash =
    (latestReport as { cash?: number } | null)?.cash ??
    (fund as { cash?: number } | null)?.cash ??
    0;
  const totalValue = liveFundTotalValue({
    cash,
    holdings: openHoldings,
    quotes,
  });
  const lastValue = (latestReport as { portfolio_value?: number } | null)
    ?.portfolio_value;
  const { todayDollar, todayPct } = liveFundTodayMove({
    liveTotal: totalValue,
    lastReportValue: lastValue,
  });

  return NextResponse.json(
    {
      totalValue,
      todayDollar,
      todayPct,
      headline:
        ((latestReport as { headline?: string } | null)?.headline ?? "").trim() ||
        null,
      dayNumber: fundDayNumber(
        (fund as { inception_date?: string } | null)?.inception_date
      ),
      openCount: openHoldings.length,
      startingCapital:
        (fund as { starting_capital?: number } | null)?.starting_capital ?? 0,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=15, s-maxage=15, stale-while-revalidate=30",
      },
    }
  );
}
