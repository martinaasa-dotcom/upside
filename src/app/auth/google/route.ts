import { NextResponse } from "next/server";
import {
  GOOGLE_AUTH_PATH,
  GOOGLE_OAUTH_COOKIE,
  buildGoogleAuthorizeUrl,
  encodeGoogleOAuthCookie,
  googleCallbackUrl,
  googleClientId,
  googleOAuthCookieOptions,
  googleRedirectOrigin,
  randomOAuthValue,
  shouldUseOwnGoogleOAuth,
} from "@/lib/auth/google-oauth";
import { isCanonicalAppHost, isLocalHost, safeInternalPath, siteUrl } from "@/lib/site-url";
import { createSupabaseServerAuth } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeInternalPath(url.searchParams.get("next"));
  const hostname = url.hostname;

  if (
    shouldUseOwnGoogleOAuth(hostname) &&
    isCanonicalAppHost(hostname) &&
    !isLocalHost(hostname) &&
    hostname !== new URL(siteUrl()).hostname
  ) {
    const dest = new URL(GOOGLE_AUTH_PATH, siteUrl());
    dest.searchParams.set("next", next);
    return NextResponse.redirect(dest);
  }

  if (shouldUseOwnGoogleOAuth(hostname)) {
    const clientId = googleClientId();
    if (!clientId) {
      return NextResponse.redirect(new URL("/login?signin=failed", url.origin));
    }
    const origin = googleRedirectOrigin(hostname, url.origin);
    const state = randomOAuthValue();
    const redirectUri = googleCallbackUrl(origin);
    const authorize = buildGoogleAuthorizeUrl({
      clientId,
      redirectUri,
      state,
    });
    const res = NextResponse.redirect(authorize);
    res.cookies.set(
      GOOGLE_OAUTH_COOKIE,
      encodeGoogleOAuthCookie({ state, next, origin }),
      googleOAuthCookieOptions(!isLocalHost(hostname))
    );
    return res;
  }

  const supabase = await createSupabaseServerAuth();
  if (!supabase) {
    return NextResponse.redirect(new URL("/login?signin=failed", url.origin));
  }
  const origin = isLocalHost(hostname) ? url.origin : siteUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) {
    console.error("google oauth fallback failed", error?.message);
    return NextResponse.redirect(new URL("/login?signin=failed", origin));
  }
  return NextResponse.redirect(data.url);
}
