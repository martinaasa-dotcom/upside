/**
 * Listing money vs book money.
 *
 * A row's share price lives in the exchange's own currency (kronor on
 * Stockholm, euros on Tallinn / Xetra, dollars in the US). The sheet's
 * EUR / USD switch only restates cost, value, and gain or loss.
 */

import { roundMoney } from "@/lib/money";
import { normalizeYahooTicker } from "@/lib/ticker";

const SUFFIX_CURRENCY: Record<string, string> = {
  ".L": "GBP",
  ".DE": "EUR",
  ".AS": "EUR",
  ".PA": "EUR",
  ".BR": "EUR",
  ".SW": "CHF",
  ".VI": "EUR",
  ".MI": "EUR",
  ".MC": "EUR",
  ".ST": "SEK",
  ".CO": "DKK",
  ".HE": "EUR",
  ".OL": "NOK",
  ".TL": "EUR",
  ".RG": "EUR",
  ".VS": "EUR",
  ".T": "JPY",
  ".HK": "HKD",
  ".TO": "CAD",
  ".AX": "AUD",
};

const CURRENCY_NAME: Record<string, string> = {
  USD: "US dollars",
  EUR: "euros",
  GBP: "British pounds",
  SEK: "Swedish kronor",
  DKK: "Danish kroner",
  NOK: "Norwegian kroner",
  CHF: "Swiss francs",
  CAD: "Canadian dollars",
  AUD: "Australian dollars",
  JPY: "Japanese yen",
  HKD: "Hong Kong dollars",
};

const EXTRA_FX_CODES = [
  "SEK",
  "DKK",
  "NOK",
  "CHF",
  "CAD",
  "AUD",
  "JPY",
  "HKD",
] as const;

export type ListingFx = {
  eurUsd?: number | null;
  gbpUsd?: number | null;
  usdPer?: Record<string, number | null | undefined>;
};

export function extraFxCodes(): readonly string[] {
  return EXTRA_FX_CODES;
}

/** Yahoo GBp/GBX is pence. Fold into pounds so the chip can say GBP. */
export function normalizeListedPrice(
  price: number,
  currency: string | null | undefined
): { amount: number; code: string } {
  let amount = price;
  let raw = (currency ?? "USD").trim();
  if (raw === "GBp" || raw === "GBX") {
    amount /= 100;
    raw = "GBP";
  }
  return { amount, code: normalizeListingCurrency(raw) ?? "USD" };
}

export function normalizeListingCurrency(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (t === "GBp" || t === "GBX") return "GBP";
  const code = t.toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  return code;
}

export function listingCurrencyFromTicker(ticker: string): string {
  const t = normalizeYahooTicker(ticker);
  const dot = t.lastIndexOf(".");
  if (dot > 0) {
    const mapped = SUFFIX_CURRENCY[t.slice(dot)];
    if (mapped) return mapped;
  }
  return "USD";
}

/** Prefer the quote's own currency; fall back to the exchange suffix. */
export function listingCurrency(
  ticker: string,
  quoteCurrency?: string | null
): string {
  return (
    normalizeListingCurrency(quoteCurrency) ?? listingCurrencyFromTicker(ticker)
  );
}

export function listingCurrencyName(code: string): string | null {
  return CURRENCY_NAME[code.toUpperCase()] ?? null;
}

export function listingPriceDigits(code: string): number {
  return code.toUpperCase() === "JPY" ? 0 : 2;
}

export function usdPerMapFromFx(fx: ListingFx | null | undefined): Record<string, number> {
  const out: Record<string, number> = { USD: 1 };
  if (!fx) return out;
  if (fx.eurUsd && fx.eurUsd > 0) out.EUR = fx.eurUsd;
  if (fx.gbpUsd && fx.gbpUsd > 0) out.GBP = fx.gbpUsd;
  if (fx.usdPer) {
    for (const [key, value] of Object.entries(fx.usdPer)) {
      const code = key.toUpperCase();
      if (value && value > 0) out[code] = value;
    }
  }
  return out;
}

export function listingAmountToUsd(
  amount: number,
  code: string,
  usdPer: Record<string, number>
): number {
  if (!Number.isFinite(amount)) return 0;
  const unit = code.toUpperCase();
  if (unit === "USD") return roundMoney(amount);
  const rate = usdPer[unit];
  if (!rate || rate <= 0) return roundMoney(amount);
  return roundMoney(amount * rate);
}

export function usdToListingAmount(
  amountUsd: number,
  code: string,
  usdPer: Record<string, number>
): number {
  if (!Number.isFinite(amountUsd)) return 0;
  const unit = code.toUpperCase();
  if (unit === "USD") return roundMoney(amountUsd);
  const rate = usdPer[unit];
  if (!rate || rate <= 0) return roundMoney(amountUsd);
  return roundMoney(amountUsd / rate);
}
