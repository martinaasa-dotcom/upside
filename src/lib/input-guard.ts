import { MAX_SAFE_MONEY, MAX_SAFE_SHARES } from "@/lib/money";

/** Strip tags and control chars, then cap length. Used for sheet names. */
export function sanitizeSheetName(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Live ticker field: letters, digits, and the exchange punctuation people type. */
export function sanitizeTickerDraft(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/<[^>]*>/g, "")
    .replace(/^[€$£]+/, "")
    .replace(/[^A-Z0-9.:=\-^]/g, "")
    .slice(0, 24);
}

/** Search box: a ticker or a company name. Keeps spaces. */
export const TICKER_QUERY_MAX = 48;

export function sanitizeTickerQuery(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/^[€$£]+/, "")
    .replace(/[^A-Za-z0-9.:=\-^&/' ]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, TICKER_QUERY_MAX);
}

export function isSafeShares(n: number): boolean {
  return Number.isFinite(n) && n > 0 && n <= MAX_SAFE_SHARES;
}

export function isSafePositiveMoney(n: number): boolean {
  return Number.isFinite(n) && n > 0 && n <= MAX_SAFE_MONEY;
}

export function isSafeSignedMoney(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n) <= MAX_SAFE_MONEY;
}
