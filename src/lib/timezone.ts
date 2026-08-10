/** App calendar timezone — Martin / Upside book runs on Tallinn local days. */
export const APP_TIMEZONE = "Europe/Tallinn";

/** YYYY-MM-DD in the app timezone (not UTC ISO). */
export function dateKeyInTz(
  input: Date | string | number,
  timeZone: string = APP_TIMEZONE
): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function todayKeyInTz(timeZone: string = APP_TIMEZONE): string {
  return dateKeyInTz(new Date(), timeZone);
}

/** Calendar-day delta between two YYYY-MM-DD keys (to − from). */
export function calendarDaysBetweenKeys(fromKey: string, toKey: string): number {
  const parse = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(toKey) - parse(fromKey)) / 86_400_000);
}

/** Days from today (Tallinn) until the given instant’s Tallinn calendar date. */
export function daysUntilInTz(
  input: Date | string | number,
  timeZone: string = APP_TIMEZONE
): number {
  const target = dateKeyInTz(input, timeZone);
  if (!target) return NaN;
  return calendarDaysBetweenKeys(todayKeyInTz(timeZone), target);
}

export function formatRelativeDays(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1) return `In ${days} days`;
  return `${Math.abs(days)} days ago`;
}
