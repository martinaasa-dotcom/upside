import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/** Header clients send for owner-gated mutations. */
export const OWNER_PIN_HEADER = "x-upside-owner-pin";

const pinFailBuckets = new Map<string, { count: number; resetAt: number }>();
const PIN_WINDOW_MS = 15 * 60 * 1000;
const PIN_MAX_FAILS = 12;

export function getOwnerPin(): string | null {
  const pin = process.env.UPSIDE_OWNER_PIN?.trim();
  return pin ? pin : null;
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

function clientKey(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function isRateLimited(req: Request): boolean {
  const bucket = pinFailBuckets.get(clientKey(req));
  return Boolean(
    bucket && bucket.resetAt >= Date.now() && bucket.count > PIN_MAX_FAILS
  );
}

function notePinFailure(req: Request) {
  const key = clientKey(req);
  const now = Date.now();
  const bucket = pinFailBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    pinFailBuckets.set(key, { count: 1, resetAt: now + PIN_WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

function clearPinFailures(req: Request) {
  pinFailBuckets.delete(clientKey(req));
}

/** Returns an error Response if PIN is missing/wrong; null if OK. */
export function requireOwnerPin(req: Request): NextResponse | null {
  const expected = getOwnerPin();
  if (!expected) {
    return NextResponse.json(
      { error: "UPSIDE_OWNER_PIN is not configured on the server" },
      { status: 503 }
    );
  }

  if (isRateLimited(req)) {
    return NextResponse.json(
      { error: "Too many invalid PIN attempts. Try again later." },
      { status: 429 }
    );
  }

  const provided =
    req.headers.get(OWNER_PIN_HEADER) ??
    new URL(req.url).searchParams.get("pin") ??
    "";
  if (!safeEqual(provided, expected)) {
    notePinFailure(req);
    if (isRateLimited(req)) {
      return NextResponse.json(
        { error: "Too many invalid PIN attempts. Try again later." },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: "Invalid owner PIN" }, { status: 401 });
  }
  clearPinFailures(req);
  return null;
}

/** Vercel Cron sends Authorization: Bearer <CRON_SECRET>. */
export function requireCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!safeEqual(token, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
