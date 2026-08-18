import { PRODUCT_DOMAIN } from "@/lib/product";
import {
  isCanonicalAppHost,
  isLocalHost,
  isVercelPreviewHost,
  safeInternalPath,
  siteUrl,
} from "@/lib/site-url";

export const GOOGLE_OAUTH_COOKIE = "ul-google-oauth";
export const GOOGLE_AUTH_PATH = "/auth/google";
export const GOOGLE_CALLBACK_PATH = "/auth/google/callback";

export type GoogleOAuthCookie = {
  state: string;
  next: string;
  origin: string;
};

export function googleClientId(): string | undefined {
  return process.env.GOOGLE_CLIENT_ID?.trim() || undefined;
}

export function googleClientSecret(): string | undefined {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || undefined;
}

export function googleOAuthConfigured(): boolean {
  return Boolean(googleClientId() && googleClientSecret());
}

/**
 * Own-domain Google login so the consent screen says upsidelab.app, not
 * the Supabase project host. Previews keep the hosted Supabase flow
 * because Google cannot allow every *.vercel.app callback.
 */
export function shouldUseOwnGoogleOAuth(hostname: string): boolean {
  if (!googleOAuthConfigured()) return false;
  if (isLocalHost(hostname)) return true;
  if (isVercelPreviewHost(hostname)) return false;
  return isCanonicalAppHost(hostname);
}

export function googleRedirectOrigin(hostname: string, origin: string): string {
  if (isLocalHost(hostname)) return origin;
  return siteUrl();
}

export function googleCallbackUrl(origin: string): string {
  return `${origin}${GOOGLE_CALLBACK_PATH}`;
}

export function randomOAuthValue(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export function encodeGoogleOAuthCookie(value: GoogleOAuthCookie): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function parseGoogleOAuthCookie(
  raw: string | undefined
): GoogleOAuthCookie | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8")
    ) as Partial<GoogleOAuthCookie>;
    if (
      typeof data.state !== "string" ||
      data.state.length < 16 ||
      typeof data.origin !== "string"
    ) {
      return null;
    }
    const origin = new URL(data.origin).origin;
    return {
      state: data.state,
      next: safeInternalPath(data.next),
      origin,
    };
  } catch {
    return null;
  }
}

export function buildGoogleAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", args.clientId);
  u.searchParams.set("redirect_uri", args.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", args.state);
  u.searchParams.set("prompt", "select_account");
  return u.toString();
}

export function googleOAuthCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 10 * 60,
  };
}

export async function exchangeGoogleCode(args: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ idToken: string; accessToken?: string }> {
  const body = new URLSearchParams({
    code: args.code,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    id_token?: string;
    access_token?: string;
    error?: string;
  };
  if (!res.ok || !json.id_token) {
    throw new Error(json.error || "Google token exchange failed");
  }
  return { idToken: json.id_token, accessToken: json.access_token };
}

export function signInFailedUrl(origin: string): URL {
  return new URL("/login?signin=failed", origin || `https://${PRODUCT_DOMAIN}`);
}
