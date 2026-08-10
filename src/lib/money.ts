/**
 * Cent-safe money helpers — avoid float display bugs (0.1+0.2).
 * Internals still use number; round at boundaries (persist / display / aggregates).
 */

export function roundMoney(n: number, digits = 2): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function roundShares(n: number, digits = 4): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Safe ratio; returns 0 when denominator is 0 / non-finite. */
export function safeDiv(num: number, den: number): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
  return num / den;
}
