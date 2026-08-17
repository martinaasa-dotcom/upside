import { requireCronAuth } from "@/lib/cron-auth";
import { dispatchOptedInNotes, noteTestAudience } from "@/lib/note-cron";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleGET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  const result = await dispatchOptedInNotes("sunday", noteTestAudience(req));
  return NextResponse.json(result, { status: result.status ?? 200 });
}

export const GET = observeRoute(handleGET, '/api/cron/sunday-note');
