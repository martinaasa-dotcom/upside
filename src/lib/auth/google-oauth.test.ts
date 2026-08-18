import { afterEach, describe, expect, it } from "vitest";
import {
  buildGoogleAuthorizeUrl,
  encodeGoogleOAuthCookie,
  googleCallbackUrl,
  googleRedirectOrigin,
  parseGoogleOAuthCookie,
  shouldUseOwnGoogleOAuth,
} from "@/lib/auth/google-oauth";
import { isCanonicalAppHost } from "@/lib/site-url";

describe("google oauth branding", () => {
  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it("sends Google back to upsidelab.app, not supabase.co", () => {
    const url = buildGoogleAuthorizeUrl({
      clientId: "238875488258-example.apps.googleusercontent.com",
      redirectUri: googleCallbackUrl("https://upsidelab.app"),
      state: "state-value-at-least-16",
    });
    expect(url).toContain(
      "redirect_uri=https%3A%2F%2Fupsidelab.app%2Fauth%2Fgoogle%2Fcallback"
    );
    expect(url).not.toContain("supabase.co");
    expect(url).toContain("prompt=select_account");
  });

  it("keeps localhost on localhost and production on the apex", () => {
    expect(googleRedirectOrigin("localhost", "http://localhost:3000")).toBe(
      "http://localhost:3000"
    );
    expect(
      googleRedirectOrigin("upsidelab.app", "https://www.upsidelab.app")
    ).toBe("https://upsidelab.app");
  });

  it("round-trips the oauth cookie", () => {
    const raw = encodeGoogleOAuthCookie({
      state: "state-value-at-least-16",
      next: "/communities?x=1",
      origin: "https://upsidelab.app",
    });
    expect(parseGoogleOAuthCookie(raw)).toEqual({
      state: "state-value-at-least-16",
      next: "/communities?x=1",
      origin: "https://upsidelab.app",
    });
    expect(parseGoogleOAuthCookie("not-valid")).toBeNull();
  });

  it("uses own-domain Google only when credentials exist", () => {
    expect(shouldUseOwnGoogleOAuth("upsidelab.app")).toBe(false);
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    expect(shouldUseOwnGoogleOAuth("upsidelab.app")).toBe(true);
    expect(shouldUseOwnGoogleOAuth("localhost")).toBe(true);
    expect(
      shouldUseOwnGoogleOAuth("upside-git-main-upthink-solutions.vercel.app")
    ).toBe(false);
    expect(isCanonicalAppHost("www.upsidelab.app")).toBe(true);
    expect(isCanonicalAppHost("uzrnybyggznpvgxgrvgl.supabase.co")).toBe(false);
  });
});
