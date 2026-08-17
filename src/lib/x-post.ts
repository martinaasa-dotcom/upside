/**
 * Post to X as the Upside Fund account. OAuth 1.0a user tokens, not an
 * app-only bearer. All four keys must be set or this is a no-op.
 */

import { createHmac, randomBytes } from "node:crypto";

const TWEET_URL = "https://api.x.com/2/tweets";

export type XPostResult =
  | { ok: true; skipped: true }
  | { ok: true; skipped: false; id: string }
  | { ok: false; skipped: false; error: string };

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function xPostingConfigured(): boolean {
  return Boolean(
    env("X_API_KEY") &&
      env("X_API_SECRET") &&
      env("X_ACCESS_TOKEN") &&
      env("X_ACCESS_TOKEN_SECRET")
  );
}

/** RFC 3986, the encoding X's OAuth 1.0a signer expects. */
export function oauthPercentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (ch) => {
    return `%${ch.charCodeAt(0).toString(16).toUpperCase()}`;
  });
}

export function oauth1Header(opts: {
  method: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
  nonce: string;
  timestamp: string;
}): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: opts.consumerKey,
    oauth_nonce: opts.nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: opts.timestamp,
    oauth_token: opts.token,
    oauth_version: "1.0",
  };
  const paramString = Object.keys(oauth)
    .sort()
    .map((k) => `${oauthPercentEncode(k)}=${oauthPercentEncode(oauth[k]!)}`)
    .join("&");
  const base = [
    opts.method.toUpperCase(),
    oauthPercentEncode(opts.url),
    oauthPercentEncode(paramString),
  ].join("&");
  const signingKey = `${oauthPercentEncode(opts.consumerSecret)}&${oauthPercentEncode(opts.tokenSecret)}`;
  oauth.oauth_signature = createHmac("sha1", signingKey)
    .update(base)
    .digest("base64");
  return `OAuth ${Object.keys(oauth)
    .sort()
    .map(
      (k) =>
        `${oauthPercentEncode(k)}="${oauthPercentEncode(oauth[k]!)}"`
    )
    .join(", ")}`;
}

export async function postTweet(text: string): Promise<XPostResult> {
  const consumerKey = env("X_API_KEY");
  const consumerSecret = env("X_API_SECRET");
  const token = env("X_ACCESS_TOKEN");
  const tokenSecret = env("X_ACCESS_TOKEN_SECRET");
  if (!consumerKey || !consumerSecret || !token || !tokenSecret) {
    return { ok: true, skipped: true };
  }

  const body = JSON.stringify({ text });
  const authorization = oauth1Header({
    method: "POST",
    url: TWEET_URL,
    consumerKey,
    consumerSecret,
    token,
    tokenSecret,
    nonce: randomBytes(16).toString("hex"),
    timestamp: Math.floor(Date.now() / 1000).toString(),
  });

  try {
    const res = await fetch(TWEET_URL, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body,
    });
    const raw = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        skipped: false,
        error: `X ${res.status}: ${raw.slice(0, 300)}`,
      };
    }
    let id = "";
    try {
      const parsed = JSON.parse(raw) as { data?: { id?: string } };
      id = parsed.data?.id?.trim() ?? "";
    } catch {
      id = "";
    }
    if (!id) {
      return { ok: false, skipped: false, error: "X returned no post id" };
    }
    return { ok: true, skipped: false, id };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : "X post failed",
    };
  }
}
