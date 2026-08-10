import type { OverviewModel } from "@/lib/overview";

export function buildWeeklyRecap(model: OverviewModel): string {
  const lines: string[] = [];
  const d = new Date();
  lines.push(`Upside weekly recap · ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`);
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
  lines.push(
    "Margus: stay thesis-first — breathers are resets, not broken narratives. Write CCs on green rebounds."
  );
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
