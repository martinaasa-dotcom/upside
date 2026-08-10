import { timingSafeEqual } from "crypto";
import { verifyAccessSecret } from "@/lib/access-secret";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { NextResponse } from "next/server";

/** Header clients send for sheet-gated mutations. */
export const OWNER_PIN_HEADER = "x-upside-owner-pin";
/** Which sheet the credential unlocks (for per-sheet PIN/password). */
export const OWNER_PORTFOLIO_HEADER = "x-upside-portfolio-id";

const pinFailBuckets = new Map<string, { count: number; resetAt: number }>();
const PIN_WINDOW_MS = 15 * 60 * 1000;
const PIN_MAX_FAILS = 12;

/** Optional admin override (env). Not required for open sheets. */
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

async function fetchSheetHash(
  portfolioId: string
): Promise<string | null> {
  const supabase = getSupabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from(PORTFELL_TABLES.portfolios)
    .select("access_secret_hash")
    .eq("id", portfolioId)
    .maybeSingle();
  const hash = (data as { access_secret_hash?: string | null } | null)
    ?.access_secret_hash;
  return hash || null;
}

async function sheetSecretOk(
  portfolioId: string,
  provided: string
): Promise<boolean> {
  const hash = await fetchSheetHash(portfolioId);
  if (!hash) return false;
  return verifyAccessSecret(provided, hash);
}

/**
 * Per-sheet lock only.
 * - No portfolioId / open sheet (no hash) → allow.
 * - Locked sheet → require that sheet’s PIN/password (or optional UPSIDE_OWNER_PIN override).
 */
export async function requireOwnerAccess(
  req: Request,
  portfolioId?: string | null
): Promise<NextResponse | null> {
  const sheetId = portfolioId ?? readPortfolioIdHint(req);

  // Book-wide or unknown target: open (no global PIN)
  if (!sheetId) return null;

  const hash = await fetchSheetHash(sheetId);
  if (!hash) return null; // sheet is unlocked

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
      { error: "This sheet is locked — enter its PIN or password" },
      { status: 401 }
    );
  }

  if (masterOk(provided) || (await sheetSecretOk(sheetId, provided))) {
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
    { error: "Invalid sheet PIN or password" },
    { status: 401 }
  );
}

/**
 * Book-level gate removed — sheets are open unless they set their own secret.
 * Kept as a no-op so call sites compile; prefer requireOwnerAccess for sheet edits.
 */
/** @deprecated Book PIN removed — open unless the target sheet is locked. */
export function requireOwnerPin(req?: Request): NextResponse | null {
  void req;
  return null;
}

/** True when provided secret matches optional admin override. */
export function isMasterSecret(provided: string): boolean {
  return masterOk(provided.trim());
}

/** Whether a sheet currently has a lock hash. */
export async function sheetIsLocked(portfolioId: string): Promise<boolean> {
  return Boolean(await fetchSheetHash(portfolioId));
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
