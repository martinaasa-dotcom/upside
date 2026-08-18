import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensureProfileAndClaims } from "@/lib/auth/ensure-profile";
import {
  GOOGLE_OAUTH_COOKIE,
  exchangeGoogleCode,
  googleCallbackUrl,
  googleClientId,
  googleClientSecret,
  googleOAuthCookieOptions,
  parseGoogleOAuthCookie,
  signInFailedUrl,
} from "@/lib/auth/google-oauth";
import { isLocalHost } from "@/lib/site-url";
import { createSupabaseAuthForResponse } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

function clearOAuthCookie(res: NextResponse, secure: boolean) {
  res.cookies.set(GOOGLE_OAUTH_COOKIE, "", {
    ...googleOAuthCookieOptions(secure),
    maxAge: 0,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secure = !isLocalHost(url.hostname);
  const cookieStore = await cookies();
  const stored = parseGoogleOAuthCookie(
    cookieStore.get(GOOGLE_OAUTH_COOKIE)?.value
  );
  const failOrigin = stored?.origin || url.origin;
  const fail = () => {
    const res = NextResponse.redirect(signInFailedUrl(failOrigin));
    clearOAuthCookie(res, secure);
    return res;
  };

  if (!stored) return fail();

  const returnedState = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!code || returnedState !== stored.state) {
    return fail();
  }

  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret) return fail();

  let tokens: { idToken: string; accessToken?: string };
  try {
    tokens = await exchangeGoogleCode({
      code,
      redirectUri: googleCallbackUrl(stored.origin),
      clientId,
      clientSecret,
    });
  } catch (err) {
    console.error(
      "google token exchange failed",
      err instanceof Error ? err.message : err
    );
    return fail();
  }

  const res = NextResponse.redirect(new URL(stored.next, stored.origin));
  const supabase = await createSupabaseAuthForResponse(res);
  if (!supabase) return fail();

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: tokens.idToken,
    access_token: tokens.accessToken,
  });
  if (error || !data.user) {
    console.error("google id token sign-in failed", error?.message);
    return fail();
  }

  try {
    await ensureProfileAndClaims(data.user);
  } catch (err) {
    console.error(
      "google sign-in claim failed",
      err instanceof Error ? err.message : err
    );
  }

  clearOAuthCookie(res, secure);
  return res;
}
