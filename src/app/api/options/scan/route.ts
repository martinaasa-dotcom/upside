import { shouldHideOptions } from "@/lib/experience-tier";
import { scanCoveredCall } from "@/lib/market/covered-call";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { checkRateLimit } from "@/lib/rate-limit";
import { readJsonBodyOr400 } from "@/lib/http";
import { isRecord, readFiniteNumber, readString } from "@/lib/unknown";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (supabase) {
    const { data: profile } = await supabase
      .from(PORTFELL_TABLES.profiles)
      .select("knows_options")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (
      shouldHideOptions(
        (profile as { knows_options?: boolean | null } | null)?.knows_options ??
          null
      )
    ) {
      return NextResponse.json({ error: "Options stay hidden." }, { status: 403 });
    }
  }

  const limit = checkRateLimit(`options-scan:${auth.user.id}`, 30, 5 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Options scan is rate-limited. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec ?? 15) } }
    );
  }

  const parsed = await readJsonBodyOr400(req);
  if (!parsed.ok) return parsed.response;
  const body = isRecord(parsed.value) ? parsed.value : {};
  const positions = Array.isArray(body.positions)
    ? body.positions.flatMap((row) => {
        if (!isRecord(row)) return [];
        const ticker = readString(row.ticker);
        const spot = readFiniteNumber(row.spot);
        const shares = readFiniteNumber(row.shares);
        if (!ticker || spot == null || shares == null) return [];
        const history = Array.isArray(row.price_history)
          ? row.price_history.filter(
              (n): n is number => typeof n === "number" && Number.isFinite(n)
            )
          : undefined;
        return [
          {
            ticker,
            spot,
            shares,
            target_call_pct: readFiniteNumber(row.target_call_pct),
            stock_target:
              row.stock_target === null
                ? null
                : readFiniteNumber(row.stock_target),
            price_history: history,
          },
        ];
      })
    : [];

  if (positions.length === 0) {
    return NextResponse.json({ options: {} });
  }

  const entries = await Promise.all(
    positions.map(async (p) => {
      const candidate = await scanCoveredCall({
        ticker: p.ticker,
        spot: p.spot,
        shares: p.shares,
        targetCallPct: p.target_call_pct,
        stockTarget: p.stock_target,
        priceHistory: p.price_history,
      });
      return [p.ticker.toUpperCase(), candidate] as const;
    })
  );

  return NextResponse.json({ options: Object.fromEntries(entries) });
}
