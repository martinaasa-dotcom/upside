/**
 * Find local highs / resistance levels from price history.
 */
export function findLocalHighs(prices: number[], window = 2): number[] {
  if (prices.length < window * 2 + 1) {
    return prices.length ? [Math.max(...prices)] : [];
  }

  const highs: number[] = [];
  for (let i = window; i < prices.length - window; i++) {
    const p = prices[i];
    let isHigh = true;
    for (let j = 1; j <= window; j++) {
      if (prices[i - j] > p || prices[i + j] > p) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) highs.push(p);
  }

  const recent = prices.slice(-20);
  if (recent.length) highs.push(Math.max(...recent));
  highs.push(Math.max(...prices));

  return [...new Set(highs.map((h) => Math.round(h * 100) / 100))].sort(
    (a, b) => a - b
  );
}

/** Round to a typical equity option strike increment */
export function roundToStrike(price: number): number {
  if (price < 25) return Math.round(price * 2) / 2;
  if (price < 200) return Math.round(price);
  return Math.round(price / 5) * 5;
}

/**
 * Stock Target = next local high / resistance above current spot.
 * Independent of Call % — Call % only sets how far the strike sits from this target.
 */
export function resolveStockTarget(
  spot: number,
  priceHistory: number[]
): number {
  if (!spot || spot <= 0) return 0;

  const highs = findLocalHighs(priceHistory)
    .filter((h) => h > spot * 1.01)
    .sort((a, b) => a - b);

  if (highs.length === 0) {
    // No clear resistance above — use a modest structural high (~8% up)
    return roundToStrike(spot * 1.08);
  }

  // Next resistance: nearest local high above spot
  return roundToStrike(highs[0]);
}

/**
 * Next Strike = Call % away from Stock Target
 * e.g. target $100, call 15% → strike $115
 */
export function nextStrikeFromTarget(
  stockTarget: number,
  callPct: number
): number {
  if (!stockTarget || stockTarget <= 0) return 0;
  return roundToStrike(stockTarget * (1 + callPct));
}
