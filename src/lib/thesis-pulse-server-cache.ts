/**
 * SWR (Stale-While-Revalidate) server-side caching for Thesis Pulse.
 * Reduces redundant LLM invocations and news fetching during volatile market sessions.
 */

import type { PulseCheck, PulseHeadline } from "@/lib/thesis-pulse";

export type PulseServerCacheEntry = {
  check: PulseCheck;
  headlines: PulseHeadline[];
  cachedAt: number;
  effectivePct: number | null;
};

// Cache timings
export const PULSE_SERVER_FRESH_TTL_MS = 15 * 60 * 1000; // 15 minutes fresh
export const PULSE_SERVER_STALE_TTL_MS = 60 * 60 * 1000; // 60 minutes stale-while-revalidate
const MAX_CACHE_SIZE = 300;

const PULSE_SERVER_CACHE = new Map<string, PulseServerCacheEntry>();
let LATEST_SUMMARY_CACHE: { summary: string; cachedAt: number } | null = null;

export function getMoveBucket(effectivePct: number | null): string {
  if (effectivePct == null || !Number.isFinite(effectivePct)) return "flat";
  if (effectivePct <= -0.10) return "down_deep";
  if (effectivePct <= -0.05) return "down_heavy";
  if (effectivePct <= -0.02) return "down_mild";
  if (effectivePct >= 0.08) return "up_deep";
  if (effectivePct >= 0.04) return "up_heavy";
  if (effectivePct >= 0.015) return "up_mild";
  return "flat";
}

export function getPulseCacheKey(
  ticker: string,
  effectivePct: number | null,
  thesis?: string,
  level?: number
): string {
  const symbol = ticker.toUpperCase();
  const bucket = getMoveBucket(effectivePct);
  const thesisKey = thesis
    ? `${thesis.trim().slice(0, 40)}:${level ?? 0}`
    : "nothesis";
  return `${symbol}:${bucket}:${thesisKey}`;
}

export function getCachedPulseCheck(
  key: string,
  opts?: { force?: boolean }
): PulseServerCacheEntry | null {
  if (opts?.force) return null;
  const entry = PULSE_SERVER_CACHE.get(key);
  if (!entry) return null;

  const age = Date.now() - entry.cachedAt;
  if (age > PULSE_SERVER_STALE_TTL_MS) {
    PULSE_SERVER_CACHE.delete(key);
    return null;
  }

  return entry;
}

export function isPulseEntryFresh(entry: PulseServerCacheEntry): boolean {
  return Date.now() - entry.cachedAt < PULSE_SERVER_FRESH_TTL_MS;
}

export function setCachedPulseCheck(
  key: string,
  check: PulseCheck,
  headlines: PulseHeadline[],
  effectivePct: number | null
) {
  prunePulseCacheIfNeeded();
  PULSE_SERVER_CACHE.set(key, {
    check,
    headlines,
    cachedAt: Date.now(),
    effectivePct,
  });
}

export function getCachedPulseSummary(): string | null {
  if (!LATEST_SUMMARY_CACHE) return null;
  if (Date.now() - LATEST_SUMMARY_CACHE.cachedAt > PULSE_SERVER_FRESH_TTL_MS) {
    return null;
  }
  return LATEST_SUMMARY_CACHE.summary;
}

export function setCachedPulseSummary(summary: string) {
  if (!summary || !summary.trim()) return;
  LATEST_SUMMARY_CACHE = {
    summary: summary.trim(),
    cachedAt: Date.now(),
  };
}

export function clearPulseCacheForTicker(ticker: string) {
  const symbol = ticker.toUpperCase();
  for (const [k] of PULSE_SERVER_CACHE.entries()) {
    if (k.startsWith(`${symbol}:`)) {
      PULSE_SERVER_CACHE.delete(k);
    }
  }
}

function prunePulseCacheIfNeeded() {
  if (PULSE_SERVER_CACHE.size > MAX_CACHE_SIZE) {
    const sorted = [...PULSE_SERVER_CACHE.entries()].sort(
      (a, b) => a[1].cachedAt - b[1].cachedAt
    );
    for (let i = 0; i < 50; i++) {
      if (sorted[i]) {
        PULSE_SERVER_CACHE.delete(sorted[i][0]);
      }
    }
  }
}
