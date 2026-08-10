/** Client alerts: earnings, strike breach, goal. */

export type UpsideAlert = {
  id: string;
  kind: "earnings" | "strike" | "goal" | "info";
  title: string;
  detail: string;
  ticker?: string;
  at: number;
};

export function buildStrikeAlerts(
  rows: Array<{
    ticker: string;
    spot: number;
    stockTarget: number | null;
    nextStrike: number | null;
  }>
): UpsideAlert[] {
  const out: UpsideAlert[] = [];
  for (const r of rows) {
    if (r.stockTarget != null && r.spot > 0 && r.spot >= r.stockTarget) {
      out.push({
        id: `strike-target-${r.ticker}`,
        kind: "strike",
        title: `${r.ticker} through Stock Target`,
        detail: `Spot ${r.spot.toFixed(2)} ≥ target ${r.stockTarget.toFixed(2)} — refresh the write plan.`,
        ticker: r.ticker,
        at: Date.now(),
      });
    }
    if (r.nextStrike != null && r.spot > 0 && r.spot >= r.nextStrike * 0.98) {
      out.push({
        id: `strike-near-${r.ticker}`,
        kind: "strike",
        title: `${r.ticker} near Next Strike`,
        detail: `Spot within ~2% of strike ${r.nextStrike.toFixed(2)}.`,
        ticker: r.ticker,
        at: Date.now(),
      });
    }
  }
  return out;
}

export function buildEarningsAlerts(
  events: Array<{ ticker: string; date: string; days: number }>
): UpsideAlert[] {
  return events
    .filter((e) => e.days >= 0 && e.days <= 7)
    .map((e) => ({
      id: `earn-${e.ticker}-${e.date}`,
      kind: "earnings" as const,
      title: `${e.ticker} earnings in ${e.days}d`,
      detail: `Dated ${e.date} — prefer expire before if writing calls.`,
      ticker: e.ticker,
      at: Date.now(),
    }));
}

export function buildGoalAlert(
  hit: boolean,
  label: string
): UpsideAlert | null {
  if (!hit) return null;
  return {
    id: `goal-${label}`,
    kind: "goal",
    title: "Milestone hit",
    detail: label,
    at: Date.now(),
  };
}
