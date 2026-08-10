import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/** Header clients send for owner-gated mutations (delete sheet, restore). */
export const OWNER_PIN_HEADER = "x-upside-owner-pin";

export function getOwnerPin(): string | null {
  const pin = process.env.UPSIDE_OWNER_PIN?.trim();
  return pin ? pin : null;
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // Still compare to keep timing flatter on length mismatch
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
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
  const provided =
    req.headers.get(OWNER_PIN_HEADER) ??
    new URL(req.url).searchParams.get("pin") ??
    "";
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Invalid owner PIN" }, { status: 401 });
  }
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
