import type { MacroNumbers } from "@/lib/paint-cache";

function liveNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * EURUSD as a USD quote gets rounded to cents in `price` (1.1582 → 1.16),
 * so the strip would sit on 1.1600 all day. Prefer the dedicated FX field,
 * then nativePrice. Keep the last good number when a poll misses a name.
 */
export function macroFromQuotesPayload(
  data: {
    quotes?: Record<
      string,
      { price?: number | null; nativePrice?: number | null }
    >;
    fx?: { eurUsd?: number | null };
  },
  prev: MacroNumbers
): MacroNumbers {
  const q = data.quotes ?? {};
  return {
    vix: liveNumber(q["^VIX"]?.price) ?? prev.vix,
    eurusd:
      liveNumber(data.fx?.eurUsd) ??
      liveNumber(q["EURUSD=X"]?.nativePrice) ??
      liveNumber(q["EURUSD=X"]?.price) ??
      prev.eurusd,
    btc: liveNumber(q["BTC-USD"]?.price) ?? prev.btc,
    tenYear: liveNumber(q["^TNX"]?.price) ?? prev.tenYear,
  };
}
