import {
  captureBookPayload,
  pruneOldSnapshots,
  saveBookSnapshot,
} from "@/lib/book-snapshot";
import { requireCronAuth } from "@/lib/cron-auth";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { todayKeyInTz } from "@/lib/timezone";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron — nightly full-book snapshot. */
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  // Cron has no user session at all, so this can only ever see/write across
  // every user's portfolios via service role. Without it, RLS would silently
  // limit the capture to nothing (anon has no auth.uid()), producing an
  // empty-but-"successful"-looking nightly snapshot — worse than skipping.
  if (!supabaseUsesServiceRole()) {
    return NextResponse.json(
      {
        error:
          "Nightly snapshot skipped — SUPABASE_SERVICE_ROLE_KEY is not configured, so a cron request (no user session) cannot read any portfolios under RLS.",
      },
      { status: 503 }
    );
  }

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
