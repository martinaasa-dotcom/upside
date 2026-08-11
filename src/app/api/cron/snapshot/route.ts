import {
  captureBookPayload,
  pruneOldSnapshots,
  saveBookSnapshot,
} from "@/lib/book-snapshot";
import { requireCronAuth } from "@/lib/cron-auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import { todayKeyInTz } from "@/lib/timezone";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron — nightly full-book snapshot. */
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  try {
    const day = todayKeyInTz();
    const payload = await captureBookPayload(supabase);
    const snap = await saveBookSnapshot(
      supabase,
      "nightly",
      `Nightly ${day}`,
      payload
    );
    await pruneOldSnapshots(supabase);
    return NextResponse.json({
      ok: true,
      snapshotId: snap.id,
      portfolios: payload.portfolios.length,
      holdings: payload.holdings.length,
    });
  } catch (err) {
    console.error("[cron/snapshot]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Snapshot failed" },
      { status: 500 }
    );
  }
}
