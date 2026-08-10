import { timingSafeEqual } from "crypto";
import { verifyAccessSecret } from "@/lib/access-secret";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextResponse } from "next/server";

/** Header clients send for owner-gated mutations. */
export const OWNER_PIN_HEADER = "x-upside-owner-pin";
/** Optional: which sheet the credential unlocks (for per-sheet PIN/password). */
export const OWNER_PORTFOLIO_HEADER = "x-upside-portfolio-id";

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

export function readProvidedSecret(req: Request): string {
  return (
    req.headers.get(OWNER_PIN_HEADER) ??
    new URL(req.url).searchParams.get("pin") ??
    ""
  ).trim();
}

export function readPortfolioIdHint(req: Request): string | null {
  const fromHeader = req.headers.get(OWNER_PORTFOLIO_HEADER)?.trim();
  if (fromHeader) return fromHeader;
  try {
    return new URL(req.url).searchParams.get("portfolioId")?.trim() || null;
  } catch {
    return null;
  }
}

function masterOk(provided: string): boolean {
  const expected = getOwnerPin();
  return Boolean(expected && safeEqual(provided, expected));
}

async function sheetSecretOk(
  portfolioId: string,
  provided: string
): Promise<boolean> {
  const supabase = getSupabaseServer();
  if (!supabase) return false;
  const { data } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("access_secret_hash")
    .eq("id", portfolioId)
    .maybeSingle();
  const hash = (data as { access_secret_hash?: string | null } | null)
    ?.access_secret_hash;
  if (!hash) return false;
  return verifyAccessSecret(provided, hash);
}

/**
 * Book default PIN/password (env) OR optional per-sheet secret.
 * Pass portfolioId when the mutation targets a sheet.
 */
export async function requireOwnerAccess(
  req: Request,
  portfolioId?: string | null
): Promise<NextResponse | null> {
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

  const provided = readProvidedSecret(req);
  if (!provided) {
    notePinFailure(req);
    return NextResponse.json(
      { error: "Owner PIN or password required" },
      { status: 401 }
    );
  }

  if (masterOk(provided)) {
    clearPinFailures(req);
    return null;
  }

  const sheetId = portfolioId ?? readPortfolioIdHint(req);
  if (sheetId && (await sheetSecretOk(sheetId, provided))) {
    clearPinFailures(req);
    return null;
  }

  notePinFailure(req);
  if (isRateLimited(req)) {
    return NextResponse.json(
      { error: "Too many invalid PIN attempts. Try again later." },
      { status: 429 }
    );
  }
  return NextResponse.json(
    { error: "Invalid owner PIN or password" },
    { status: 401 }
  );
}

/** Book-level gate (master default only). Prefer requireOwnerAccess for sheet edits. */
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

  const provided = readProvidedSecret(req);
  if (!safeEqual(provided, expected)) {
    notePinFailure(req);
    if (isRateLimited(req)) {
      return NextResponse.json(
        { error: "Too many invalid PIN attempts. Try again later." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "Invalid owner PIN or password" },
      { status: 401 }
    );
  }
  clearPinFailures(req);
  return null;
}

/** True when provided secret matches book default. */
export function isMasterSecret(provided: string): boolean {
  return masterOk(provided.trim());
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
