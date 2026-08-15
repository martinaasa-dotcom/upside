/**
 * Placeholder sparkline when a provider has a last print but no history.
 * `changePercentPoints` is 1.5 for +1.5%, matching Yahoo/Finnhub/Twelve Data.
 */

export function priorPriceFromChange(
  price: number,
  changePercentPoints: number
): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  const denom = 1 + changePercentPoints / 100;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-9) return price;
  const prior = price / denom;
  return Number.isFinite(prior) && prior > 0 ? prior : price;
}

export function synthesizeSparkline(
  price: number,
  changePercentPoints: number
): number[] {
  const points = 30;
  if (!Number.isFinite(price) || price <= 0) {
    return Array.from({ length: points }, () => 0.01);
  }
  const start = priorPriceFromChange(price, changePercentPoints);
  const series: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const drift = start + (price - start) * t;
    const noise = Math.sin(i * 1.7) * price * 0.008;
    series.push(Math.max(0.01, drift + noise));
  }
  series[points - 1] = price;
  return series;
}
