import { logEvent, sanitizeContext } from "@/lib/telemetry";
import { observeRoute } from "@/lib/observe-route";
import { clientIp } from "@/lib/rate-limit";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";
import { telemetryPostSchema } from "@/lib/api-schemas";
import { parseJsonBody } from "@/lib/parse-json-body";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Silent production sink for web vitals (and other non-error telemetry).
 * Writes structured JSON to stdout so Vercel logs can filter on `event`.
 * Not stored in portfell_error_log.
 */
async function handlePOST(req: NextRequest) {
  const ip = clientIp(req);
  const limit = await takeDurableRateLimit(`telemetry:${ip}`, 60, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const parsed = await parseJsonBody(req, telemetryPostSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const fields = sanitizeContext({
    name: body.name,
    value: body.value,
    rating: body.rating ?? null,
    id: body.id ?? null,
    navigationType: body.navigationType ?? null,
    delta: body.delta ?? null,
    path: body.path ?? null,
  });

  logEvent("web_vital", fields ?? { name: body.name, value: body.value });
  return NextResponse.json({ ok: true });
}

export const POST = observeRoute(handlePOST, "/api/internal/telemetry");
