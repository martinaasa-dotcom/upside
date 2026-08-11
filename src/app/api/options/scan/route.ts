import { scanCoveredCall } from "@/lib/market/covered-call";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScanBody = {
  positions?: Array<{
    ticker: string;
    spot: number;
    shares: number;
    target_call_pct?: number;
    stock_target?: number | null;
    price_history?: number[];
  }>;
};

export async function POST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const body = (await req.json()) as ScanBody;
  const positions = body.positions ?? [];

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
