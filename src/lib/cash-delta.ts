import { roundMoney } from "@/lib/money";

/** Buy spends cash. Sell adds it back. */
export function tradeCashDelta(opts: {
  buyShares?: number;
  buyPrice?: number;
  sellShares?: number;
  sellPrice?: number;
}): number {
  const spend = (opts.buyShares ?? 0) * (opts.buyPrice ?? 0);
  const take = (opts.sellShares ?? 0) * (opts.sellPrice ?? 0);
  return roundMoney(take - spend);
}

export function importCashDelta(
  existing: { ticker: string; shares: number; buy_price: number }[],
  next: { ticker: string; shares: number; buy_price: number }[],
  replace: boolean,
  salePx: Record<string, number>
): number {
  const prev = new Map(
    existing.map((h) => [h.ticker.trim().toUpperCase(), h])
  );
  const keep = new Set<string>();
  let delta = 0;
  for (const row of next) {
    const key = row.ticker.trim().toUpperCase();
    if (!key) continue;
    keep.add(key);
    const old = prev.get(key);
    if (!old) {
      delta += tradeCashDelta({
        buyShares: row.shares,
        buyPrice: row.buy_price,
      });
    } else if (row.shares > old.shares) {
      delta += tradeCashDelta({
        buyShares: row.shares - old.shares,
        buyPrice: row.buy_price,
      });
    } else if (row.shares < old.shares) {
      const px = salePx[key] ?? old.buy_price;
      delta += tradeCashDelta({
        sellShares: old.shares - row.shares,
        sellPrice: px,
      });
    }
  }
  if (replace) {
    for (const old of existing) {
      const key = old.ticker.trim().toUpperCase();
      if (!keep.has(key)) {
        const px = salePx[key] ?? old.buy_price;
        delta += tradeCashDelta({
          sellShares: old.shares,
          sellPrice: px,
        });
      }
    }
  }
  return roundMoney(delta);
}
