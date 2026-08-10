/** Per-sheet display currency for totals (prices stay USD). */

export type DisplayCurrency = "USD" | "EUR";

export const DISPLAY_CURRENCY_KEY = "upside-display-currency-v1";

export function loadDisplayCurrencyMap(): Record<string, DisplayCurrency> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DISPLAY_CURRENCY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, DisplayCurrency> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === "USD" || v === "EUR") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveDisplayCurrencyMap(map: Record<string, DisplayCurrency>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DISPLAY_CURRENCY_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getDisplayCurrency(
  map: Record<string, DisplayCurrency>,
  portfolioId: string
): DisplayCurrency {
  return map[portfolioId] ?? "USD";
}

/**
 * Convert a USD amount into the sheet display currency.
 * `eurUsd` = dollars per 1 euro (Yahoo EURUSD=X).
 */
export function usdToDisplay(
  amountUsd: number,
  currency: DisplayCurrency,
  eurUsd: number | null
): number {
  if (currency === "USD" || !eurUsd || eurUsd <= 0) return amountUsd;
  return amountUsd / eurUsd;
}
