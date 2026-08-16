/**
 * Hairline grids (`gap-px` on `bg-border`) paint every CSS grid track,
 * including leftover ones. Five items in three columns leaves a dead box.
 * These helpers return a column count that always divides the item count.
 */

function normalizeCount(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.floor(count);
}

/** Toggles and chips: prefer a full last row, leaning toward more columns. */
export function filledGridColumns(
  count: number,
  preferred = 3,
  maxCols = 6
): number {
  const n = normalizeCount(count);
  if (n <= 1) return 1;
  const max = Math.min(Math.max(1, Math.floor(maxCols)), n);
  const want = Math.min(Math.max(1, Math.floor(preferred)), max);
  if (n % want === 0) return want;

  const divisors: number[] = [];
  for (let c = 2; c <= max; c++) {
    if (n % c === 0) divisors.push(c);
  }
  if (divisors.length === 0) return n <= maxCols ? n : 1;

  divisors.sort((a, b) => {
    const da = Math.abs(a - want);
    const db = Math.abs(b - want);
    if (da !== db) return da - db;
    return b - a;
  });
  return divisors[0]!;
}

/** Number tiles: never go skinnier than `preferred`. Stack rather than a row of five cards. */
export function filledCardColumns(count: number, preferred = 3): number {
  const n = normalizeCount(count);
  if (n <= 1) return 1;
  const want = Math.min(Math.max(1, Math.floor(preferred)), n);
  if (n % want === 0) return want;
  for (let c = want; c >= 1; c--) {
    if (n % c === 0) return c;
  }
  return 1;
}
