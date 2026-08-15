/**
 * Cent-safe money helpers.
 *
 * Money is stored as a JS number, so every value that reaches the database
 * has to be rounded at the boundary or binary floating point leaks through
 * (the classic 0.1 + 0.2 = 0.30000000000000004).
 *
 * Rounding half away from zero, not `Math.round`, is the point of the sign
 * handling below. `Math.round` breaks ties toward +Infinity, so it rounds
 * 0.005 up to 0.01 but -0.005 up to -0.00 — a buy and the sell that undoes
 * it would not cancel out, and this app runs sheets with negative cash
 * balances, where every delta has a mirror image on the other side of zero.
 *
 * The epsilon nudge is applied *after* scaling, which is the only place it
 * does anything. Adding Number.EPSILON to the input first (a common
 * shortcut) is a no-op for any value above ~1, so 8.165 * 100 landing on
 * 816.4999999999999 still rounded down to 8.16.
 */

/** Largest value we can round without losing integer precision at 2 digits. */
export const MAX_SAFE_MONEY = Number.MAX_SAFE_INTEGER / 100;

/** Share counts above this are not a real position. Guard against overflow. */
export const MAX_SAFE_SHARES = 1_000_000_000_000;

function roundHalfAwayFromZero(n: number, digits: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n === 0) return 0;

  const factor = 10 ** digits;
  const sign = n < 0 ? -1 : 1;
  const scaled = Math.abs(n) * factor;

  // Undo the representation error the multiply just introduced, in
  // proportion to the magnitude. Without this, values whose exact decimal
  // form ends in a 5 land just below the .5 boundary and round the wrong way.
  const corrected = scaled + scaled * Number.EPSILON;
  const rounded = Math.round(corrected);

  // sign * 0 would hand back -0, which serialises as "-0" in JSON and fails
  // Object.is against 0, so callers comparing balances see a phantom change.
  if (rounded === 0) return 0;
  return (sign * rounded) / factor;
}

export function roundMoney(n: number, digits = 2): number {
  if (!Number.isFinite(n)) return 0;
  // Past this the mantissa can't hold cents, so rounding is a lie either
  // way. Clamp rather than return a number nobody can reason about.
  if (Math.abs(n) > MAX_SAFE_MONEY) {
    return n < 0 ? -MAX_SAFE_MONEY : MAX_SAFE_MONEY;
  }
  return roundHalfAwayFromZero(n, digits);
}

export function roundShares(n: number, digits = 4): number {
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n) > MAX_SAFE_SHARES) {
    return n < 0 ? -MAX_SAFE_SHARES : MAX_SAFE_SHARES;
  }
  return roundHalfAwayFromZero(n, digits);
}

/** Coerce junk (NaN, Infinity, non-numbers) to a finite fallback. */
export function finiteNumber(n: unknown, fallback = 0): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/** Safe ratio; returns 0 when the denominator is 0 or either side is junk. */
export function safeDiv(num: number, den: number): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
  const out = num / den;
  return Number.isFinite(out) ? out : 0;
}

/** Simple mean of finite values. Empty / all-junk → 0. */
export function mean(values: Iterable<number>): number {
  let n = 0;
  let s = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    s += v;
    n += 1;
  }
  return n > 0 ? s / n : 0;
}

/**
 * Weight-weighted mean. Returns null when every weight is junk or ≤ 0 so
 * callers can tell "no reading" from "the reading is actually zero".
 */
export function weightedMean(
  items: Iterable<{ value: number; weight: number }>
): number | null {
  let num = 0;
  let den = 0;
  for (const { value, weight } of items) {
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) {
      continue;
    }
    num += value * weight;
    den += weight;
  }
  if (den <= 0) return null;
  const out = num / den;
  return Number.isFinite(out) ? out : null;
}

/**
 * Compound annual growth as a fraction (0.12 = 12%/yr).
 * Null when start/end/years aren't a real growth interval: zero start,
 * non-positive years, or a path that would overflow.
 */
export function cagr(
  start: number,
  end: number,
  years: number
): number | null {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !Number.isFinite(years) ||
    start <= 0 ||
    end <= 0 ||
    years <= 0
  ) {
    return null;
  }
  const out = Math.pow(end / start, 1 / years) - 1;
  return Number.isFinite(out) ? out : null;
}

/**
 * Sum money without letting the running total drift. Rounding only at the
 * end lets a long column of cents accumulate error; rounding each addition
 * keeps every intermediate value exact to the cent.
 */
export function sumMoney(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    total = roundMoney(total + v);
  }
  return total;
}
