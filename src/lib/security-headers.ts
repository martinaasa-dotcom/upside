/**
 * Browser security headers for upsidelab.app.
 *
 * Static headers (HSTS, frame denial, nosniff, …) live in next.config.ts so
 * they cover every response, including static files that skip proxy.ts.
 *
 * CSP is built per-request in proxy.ts so Next.js inline scripts can carry a
 * nonce. Do not also set Content-Security-Policy in next.config: two CSP
 * headers are AND'd by the browser and the nonce policy would fail.
 */

export const STATIC_SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

function supabaseConnectSrc(): string[] {
  const raw =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  if (!raw) {
    return ["https://*.supabase.co", "wss://*.supabase.co"];
  }
  try {
    const origin = new URL(raw).origin;
    const host = new URL(raw).host;
    return [origin, `wss://${host}`];
  } catch {
    return ["https://*.supabase.co", "wss://*.supabase.co"];
  }
}

/**
 * Strict CSP with a per-request nonce for Next-generated scripts.
 *
 * `'strict-dynamic'` is intentionally omitted: Vercel Analytics / Speed
 * Insights inject same-origin scripts at runtime without a nonce, and
 * `'strict-dynamic'` would ignore `'self'` and block them.
 */
export function buildContentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  const isPreview = process.env.VERCEL_ENV === "preview";
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "https://va.vercel-scripts.com",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ];
  const connectSrc = [
    "'self'",
    ...supabaseConnectSrc(),
    "https://va.vercel-scripts.com",
    "https://vitals.vercel-insights.com",
    ...(isPreview ? ["https://vercel.live", "wss://ws-us3.pusher.com"] : []),
    ...(isDev
      ? [
          "http://localhost:*",
          "http://127.0.0.1:*",
          "ws://localhost:*",
          "ws://127.0.0.1:*",
        ]
      : []),
  ];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src ${connectSrc.join(" ")}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}
