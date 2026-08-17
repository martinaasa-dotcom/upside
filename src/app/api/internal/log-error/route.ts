import { logError } from "@/lib/error-log";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAuthUser } from "@/lib/supabase/server-auth";
import { readJsonBody } from "@/lib/http";
import { isRecord, readString } from "@/lib/unknown";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Client-side error boundaries (error.tsx / global-error.tsx) report here.
 * Deliberately no requireAuthUser() — a render error on the sign-in screen
 * itself, before anyone's logged in, should still be reportable. Rate
 * limited per IP instead since this is an unauthenticated write endpoint.
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = checkRateLimit(`log-error:${ip}`, 20, 5 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const raw = await readJsonBody(req);
  const body = isRecord(raw) ? raw : {};
  const message = (readString(body.message) ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  // Best-effort — an error report shouldn't itself require a valid session.
  const user = await getAuthUser().catch(() => null);

  await logError({
    source: "client",
    message,
    stack: readString(body.stack) ?? null,
    digest: readString(body.digest) ?? null,
    path: readString(body.path) ?? null,
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
