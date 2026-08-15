import type { WheelEvent } from "react";
import { roundMoney } from "@/lib/money";

/** Prevent mouse-wheel from changing focused number inputs while scrolling the page. */
export function blockWheelChange(e: WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur();
}

/** Always parse with `.` as decimal (accepts `,` from paste). */
export function parseDecimal(raw: string): number {
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  return Number(cleaned);
}

/** Fixed decimal string with period separator (never locale commas). */
export function formatDecimal(value: number, digits: number): string {
  if (!Number.isFinite(value)) return "";
  return roundMoney(value, digits).toFixed(digits);
}
