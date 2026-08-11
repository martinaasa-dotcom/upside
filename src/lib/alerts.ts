/** Client alerts: earnings, strike breach, goal, decision cards. */

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
        title: `${r.ticker} near planned Next Strike`,
        detail: `Spot within ~2% of sheet strike ${r.nextStrike.toFixed(2)} — plan level, not a confirmed open call unless you logged premium.`,
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
      detail: `Dated ${e.date} — vol often expands into the print; CC writes into earnings can be attractive if you accept gap/assignment risk.`,
      ticker: e.ticker,
      at: Date.now(),
    }));
}

/** Extra decision cards: margin, concentration. */
export function buildDecisionAlerts(input: {
  cash: number;
  equityValue: number;
  topTicker?: { ticker: string; value: number } | null;
}): UpsideAlert[] {
  const out: UpsideAlert[] = [];
  if (input.cash < -500) {
    out.push({
      id: "decision-margin",
      kind: "info",
      title: "Margin in play",
      detail: `Cash ${input.cash.toFixed(0)} — keep leverage intentional (~30% ceiling).`,
      at: Date.now(),
    });
  }
  if (
    input.topTicker &&
    input.equityValue > 0 &&
    input.topTicker.value / input.equityValue >= 0.35
  ) {
    const share = (input.topTicker.value / input.equityValue) * 100;
    out.push({
      id: `decision-conc-${input.topTicker.ticker}`,
      kind: "info",
      title: `${input.topTicker.ticker} is ${share.toFixed(0)}% of equity`,
      detail: "Know the blast radius if the thesis hiccups.",
      ticker: input.topTicker.ticker,
      at: Date.now(),
    });
  }
  return out;
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
