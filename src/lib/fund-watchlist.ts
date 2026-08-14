export type FundWatchItem = {
  ticker: string;
  waitFor: string;
};

/** Drop held names, junk tickers, and empties so the public list stays honest. */
export function sanitizeFundWatchlist(
  items: { ticker: string; waitFor: string }[] | null | undefined,
  heldTickers: string[]
): FundWatchItem[] {
  const held = new Set(
    heldTickers.map((t) => t.trim().toUpperCase()).filter(Boolean)
  );
  const seen = new Set<string>();
  const out: FundWatchItem[] = [];
  for (const item of items ?? []) {
    const ticker = String(item.ticker ?? "")
      .trim()
      .toUpperCase()
      .replace(/^\$/, "");
    if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(ticker)) continue;
    if (held.has(ticker) || seen.has(ticker)) continue;
    const waitFor = String(item.waitFor ?? "").replace(/\s+/g, " ").trim();
    if (!waitFor) continue;
    seen.add(ticker);
    out.push({ ticker, waitFor });
    if (out.length >= 4) break;
  }
  return out;
}
