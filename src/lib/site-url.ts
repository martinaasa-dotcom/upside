/**
 * Canonical public origin. Swap UPSIDE_CANONICAL_HOST (or
 * NEXT_PUBLIC_SITE_URL) when the product gets its own domain. Until then
 * this stays the production Vercel alias so OG, sitemap, and robots agree.
 */
const DEFAULT_HOST = "upside-upthink-solutions.vercel.app";

function host(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.UPSIDE_CANONICAL_HOST?.trim() ||
    DEFAULT_HOST;
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export function siteUrl(): string {
  return `https://${host()}`;
}
