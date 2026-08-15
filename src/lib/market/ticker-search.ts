export type TickerSuggestion = {
  symbol: string;
  name: string | null;
};

const WATCH_SYMBOL = /^[A-Z0-9.=^-]{1,12}$/;

/** Popular-list matches while Yahoo is still thinking. */
export function localTickerSuggestions(
  query: string,
  catalog: string[],
  exclude: Set<string>
): TickerSuggestion[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const seen = new Set<string>();
  const out: TickerSuggestion[] = [];

  const push = (symbol: string) => {
    const s = symbol.trim().toUpperCase();
    if (!WATCH_SYMBOL.test(s) || exclude.has(s) || seen.has(s)) return;
    seen.add(s);
    out.push({ symbol: s, name: null });
  };

  for (const t of catalog) {
    if (t === q) push(t);
  }
  for (const t of catalog) {
    if (t.startsWith(q) && t !== q) push(t);
  }
  for (const t of catalog) {
    if (!t.startsWith(q) && t.includes(q)) push(t);
  }
  if (out.length === 0 && WATCH_SYMBOL.test(q) && !exclude.has(q)) {
    push(q);
  }
  return out.slice(0, 8);
}

export function mergeTickerSuggestions(
  local: TickerSuggestion[],
  remote: TickerSuggestion[],
  exclude: Set<string>,
  limit = 8
): TickerSuggestion[] {
  const seen = new Set<string>();
  const out: TickerSuggestion[] = [];

  const push = (row: TickerSuggestion) => {
    const symbol = row.symbol.trim().toUpperCase();
    if (!WATCH_SYMBOL.test(symbol) || exclude.has(symbol)) return;
    const existing = out.find((r) => r.symbol === symbol);
    if (existing) {
      if (!existing.name && row.name) existing.name = row.name;
      return;
    }
    if (seen.has(symbol)) return;
    seen.add(symbol);
    out.push({ symbol, name: row.name });
  };

  for (const row of local) push(row);
  for (const row of remote) push(row);
  return out.slice(0, limit);
}
