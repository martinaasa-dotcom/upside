import { cashtag, currency, percent } from "@/lib/format";
import { safeDiv } from "@/lib/money";
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
        id: `strike-target-${cashtag(r.ticker)}`,
        kind: "strike",
        title: `${cashtag(r.ticker)} passed the price you were aiming for`,
        detail: `It's at ${r.spot.toFixed(2)}, above your ${r.stockTarget.toFixed(2)} target. Worth revisiting the call plan.`,
        ticker: r.ticker,
        at: Date.now(),
      });
    }
    if (r.nextStrike != null && r.spot > 0 && r.spot >= r.nextStrike * 0.98) {
      out.push({
        id: `strike-near-${cashtag(r.ticker)}`,
        kind: "strike",
        title: `${cashtag(r.ticker)} is closing in on your strike`,
        detail: `Within about 2% of ${r.nextStrike.toFixed(2)}. This is your planned level, not a call you've actually sold.`,
        ticker: r.ticker,
        at: Date.now(),
      });
    }
  }
  return out;
}

/**
 * The options half of this used to be unconditional, so somebody who told
 * onboarding they've never traded an option still got told about writing
 * calls into a print. `hideOptions` is the same flag that strips the CC
 * panel and Margus's options tools.
 */
export function buildEarningsAlerts(
  events: Array<{ ticker: string; date: string; days: number }>,
  hideOptions = true
): UpsideAlert[] {
  return events
    .filter((e) => e.days >= 0 && e.days <= 7)
    .map((e) => ({
      id: `earn-${cashtag(e.ticker)}-${e.date}`,
      kind: "earnings" as const,
      title:
        e.days === 0
          ? `${cashtag(e.ticker)} reports today`
          : `${cashtag(e.ticker)} reports in ${e.days} ${e.days === 1 ? "day" : "days"}`,
      detail: hideOptions
        ? `Set for ${e.date}. Results days tend to move a stock more than usual, in either direction.`
        : `Set for ${e.date}. Prices swing harder around results, which makes options pricier to sell and riskier to hold through.`,
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
      title: "You're using borrowed money",
      detail: `Cash is ${currency(input.cash, 0)}, so part of this book is on margin. Losses get amplified the same way gains do.`,
      at: Date.now(),
    });
  }
  if (
    input.topTicker &&
    input.equityValue > 0 &&
    safeDiv(input.topTicker.value, input.equityValue) >= 0.35
  ) {
    const share = safeDiv(input.topTicker.value, input.equityValue);
    out.push({
      id: `decision-conc-${cashtag(input.topTicker.ticker)}`,
      kind: "info",
      title: `${cashtag(input.topTicker.ticker)} is ${percent(share, 0)} of your stocks`,
      detail:
        "One name this big means your year mostly rides on it. Fine if you meant it. A problem if you didn't.",
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
