import type { Quote } from "@/lib/types";
import { formatRelativeTime } from "@/lib/timezone";

/** Title-attribute copy when a cell is showing a last-known print. */
export function quoteAsOfTitle(
  quote: Quote | null | undefined,
  now: number = Date.now()
): string | undefined {
  if (!quote?.stale) return undefined;
  const at = quote.quotedAt;
  if (at == null || !Number.isFinite(at)) return "Price as of last known print";
  const rel = formatRelativeTime(at, now);
  if (!rel || rel === "just now") return "Price as of last known print";
  return `Price as of ${rel}`;
}

export function quotesStampMs(payload: {
  updatedAt?: string | null;
  quotes?: Record<string, Quote> | null;
}): number {
  const parsed = Date.parse(payload.updatedAt ?? "");
  if (Number.isFinite(parsed)) return parsed;
  let min = Infinity;
  for (const q of Object.values(payload.quotes ?? {})) {
    if (typeof q.quotedAt === "number" && q.quotedAt > 0 && q.quotedAt < min) {
      min = q.quotedAt;
    }
  }
  return Number.isFinite(min) ? min : Date.now();
}

export function quotesAreDelayed(payload: {
  delayed?: boolean;
  missing?: string[] | null;
  quotes?: Record<string, Quote> | null;
}): boolean {
  if (payload.delayed) return true;
  if ((payload.missing?.length ?? 0) > 0) return true;
  return Object.values(payload.quotes ?? {}).some((q) => q.stale === true);
}
