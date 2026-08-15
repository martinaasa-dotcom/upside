import { requireCronAuth } from "@/lib/cron-auth";
import { dispatchEmptyBookNudges } from "@/lib/empty-book-nudge";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily. One-time encouragement if the book is still empty a week after signup. */
export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  const result = await dispatchEmptyBookNudges();
  return NextResponse.json(result, { status: result.status ?? 200 });
}
