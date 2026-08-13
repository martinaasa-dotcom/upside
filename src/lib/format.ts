/**
 * Every formatter rejects non-finite input, not just NaN. Division by a
 * zero cost basis (a gifted share, a fully written-down position, a
 * ticker whose previous close came back as 0) yields Infinity rather than
 * NaN in JS, which Intl happily renders as "$∞" and toFixed renders as
 * "Infinity%". A dash is the honest answer in all of those cases.
 */
function isRenderable(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

export function currency(
  value: number | null | undefined,
  digits = 2,
  code: "USD" | "EUR" = "USD"
): string {
  if (!isRenderable(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** `value` is a fraction (0.123 → 12.3%). Default: 1 decimal place. */
export function percent(value: number | null | undefined, digits = 1): string {
  if (!isRenderable(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/** Plain number. Default: 0 decimals (shares). */
export function number(value: number | null | undefined, digits = 0): string {
  if (!isRenderable(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function signedCurrency(value: number | null | undefined): string {
  if (!isRenderable(value)) return "—";
  const formatted = currency(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

/**
 * "1 sheet" / "2 sheets". Pass an explicit plural for irregular words.
 * Counts here are small and human-scale (sheets, holdings, members), so
 * the naive s-suffix covers everything we actually label.
 */
export function plural(
  count: number,
  singular: string,
  pluralForm = `${singular}s`
): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
