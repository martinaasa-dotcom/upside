/**
 * CDN cache headers for public, non-personal GET responses.
 *
 * Next.js stamps Route Handlers with `Cache-Control: no-store`. Browsers
 * should still revalidate (`max-age=0`). The Vercel/CDN copies are what
 * actually stick on the edge, so a London tab is not waiting on iad1.
 *
 * Do not set `runtime = "edge"` to chase this. Next 16.3 deprecates that
 * runtime. Node (Fluid Compute) plus these headers is the global path.
 */

export function publicCdnHeaders(
  sMaxAgeSec: number,
  staleWhileRevalidateSec = sMaxAgeSec * 2
): Record<string, string> {
  const value = `public, max-age=0, s-maxage=${sMaxAgeSec}, stale-while-revalidate=${staleWhileRevalidateSec}`;
  return {
    "Cache-Control": value,
    "CDN-Cache-Control": value,
    "Vercel-CDN-Cache-Control": value,
  };
}

/** Errors must not occupy the CDN for the happy-path TTL. */
export function noStoreHeaders(): Record<string, string> {
  const value = "private, no-store";
  return {
    "Cache-Control": value,
    "CDN-Cache-Control": value,
    "Vercel-CDN-Cache-Control": value,
  };
}
