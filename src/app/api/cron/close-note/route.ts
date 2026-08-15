import { requireCronAuth } from "@/lib/cron-auth";
import { dispatchOptedInNotes } from "@/lib/note-cron";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  const result = await dispatchOptedInNotes("close");
  return NextResponse.json(result, { status: result.status ?? 200 });
}
