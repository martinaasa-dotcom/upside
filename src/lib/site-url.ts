import { PRODUCT_DOMAIN } from "@/lib/product";

/**
 * Canonical public origin. Default is upsidelab.app. Override with
 * UPSIDE_CANONICAL_HOST or NEXT_PUBLIC_SITE_URL only for a temporary
 * preview or a staging host.
 */
const DEFAULT_HOST = PRODUCT_DOMAIN;

function host(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.UPSIDE_CANONICAL_HOST?.trim() ||
    DEFAULT_HOST;
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
}

export function siteHost(): string {
  return host();
}

export function siteUrl(): string {
  return `https://${host()}`;
}

const LEGACY_HOSTS = new Set([
  "upside-upthink-solutions.vercel.app",
  "upside-upthink1.vercel.app",
  "upside-git-main-upthink1.vercel.app",
  "portfolio.vercel.app",
  "www.upsidelab.app",
]);

export function isLegacyHost(hostname: string): boolean {
  const h = hostname.split(":")[0].toLowerCase();
  if (LEGACY_HOSTS.has(h)) return true;
  if (h.startsWith("portfolio-") && h.endsWith(".vercel.app")) return true;
  return false;
}

export function isLocalHost(hostname: string): boolean {
  const h = hostname.split(":")[0].toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    h.endsWith(".local")
  );
}

/**
 * Any *.vercel.app host that is not a known production alias.
 * Previews must keep working; production aliases are in LEGACY_HOSTS.
 */
export function isVercelPreviewHost(hostname: string): boolean {
  const h = hostname.split(":")[0].toLowerCase();
  if (!h.endsWith(".vercel.app")) return false;
  if (LEGACY_HOSTS.has(h)) return false;
  if (h === host()) return false;
  return true;
}
