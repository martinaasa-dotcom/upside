import { logError } from "@/lib/error-log";
import { clientIp } from "@/lib/rate-limit";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";
import { getAuthUser } from "@/lib/supabase/server-auth";
import { sanitizeContext } from "@/lib/telemetry";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { logErrorPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";

export const dynamic = "force-dynamic";

/**
 * Client-side error boundaries (error.tsx / global-error.tsx) report here.
 * Deliberately no requireAuthUser() — a render error on the sign-in screen
 * itself, before anyone's logged in, should still be reportable. Rate
 * limited per IP instead since this is an unauthenticated write endpoint.
 */
async function handlePOST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = await takeDurableRateLimit(`log-error:${ip}`, 20, 5 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const parsed = await parseJsonBody(req, logErrorPostSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const message = body.message.trim();

  // Best-effort — an error report shouldn't itself require a valid session.
  const user = await getAuthUser().catch(() => null);

  await logError({
    source: "client",
    message,
    stack: body.stack ?? null,
    digest: body.digest ?? null,
    path: body.path ?? null,
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    userAgent: req.headers.get("user-agent"),
    context: sanitizeContext(body.context),
  });

  return NextResponse.json({ ok: true });
}

export const POST = observeRoute(handlePOST, '/api/internal/log-error');
