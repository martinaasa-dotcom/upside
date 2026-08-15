import type { OverviewModel } from "@/lib/overview";
import { hashSeed, mulberry32, pick } from "@/lib/seeded-rng";

/** ISO-ish week key (Mon-start) so the sign-off rotates weekly, not per render. */
function weekKey(d: Date): string {
  const copy = new Date(d.getTime());
  const day = (copy.getDay() + 6) % 7; // Mon=0..Sun=6
  copy.setDate(copy.getDate() - day);
  return `${copy.getFullYear()}-${copy.getMonth()}-${copy.getDate()}`;
}

const SIGN_OFFS = [
  "Margus: stick to why you bought. A quiet week is a reset, not a broken story.",
  "Margus: the reason you own it didn't change just because the price did. Don't sell the news.",
  "Margus: green weeks feel earned, red weeks feel personal. Neither one is. Same plan either way.",
  "Margus: boredom isn't a signal. If nothing broke why you own it, nothing needs to change.",
  "Margus: patience pays. Don't tinker just because the week was dull.",
  "Margus: the sheet doesn't know what day it is. Judge the idea over months, not one week.",
];

export function buildWeeklyRecap(model: OverviewModel): string {
  const lines: string[] = [];
  const d = new Date();
  lines.push(`Upside Lab weekly recap · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`);
  lines.push("");
  lines.push(
    `Book value ${fmt(model.totals.totalValue)} · ROI ${pct(model.totals.roiPct)} (${fmt(model.totals.roiDollar)}) · cash ${fmt(model.totals.cash)}`
  );
  const winners = [...model.tickers]
    .filter((t) => t.todayPct != null)
    .sort((a, b) => (b.todayPct ?? 0) - (a.todayPct ?? 0))
    .slice(0, 3);
  const losers = [...model.tickers]
    .filter((t) => t.todayPct != null)
    .sort((a, b) => (a.todayPct ?? 0) - (b.todayPct ?? 0))
    .slice(0, 3);
  if (winners.length) {
    lines.push(
      `Today’s leaders: ${winners.map((t) => `${t.ticker} ${pct(t.todayPct!)}`).join(" · ")}`
    );
  }
  if (losers.length) {
    lines.push(
      `Today’s laggards: ${losers.map((t) => `${t.ticker} ${pct(t.todayPct!)}`).join(" · ")}`
    );
  }
  const topRoi = [...model.tickers].sort((a, b) => b.roiPct - a.roiPct)[0];
  if (topRoi) {
    lines.push(
      `All-time heat: ${topRoi.ticker} ${pct(topRoi.roiPct)} on ${fmt(topRoi.currentValue)}`
    );
  }
  lines.push("");
  const rng = mulberry32(
    hashSeed(`upside-recap-signoff|${weekKey(d)}|${Math.round(model.totals.totalValue)}`)
  );
  lines.push(pick(rng, SIGN_OFFS));
  return lines.join("\n");
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
