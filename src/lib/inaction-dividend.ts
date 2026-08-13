/**
 * Inaction Dividend & Patience Tracker.
 * Quantifies and celebrates the hardest skill in investing:
 * sitting on your hands and letting compounding work when your thesis is intact.
 */

const LAST_TRADE_KEY = "upside-last-trade-time-v1";

export type PatienceMetrics = {
  daysWithoutTrading: number;
  lastTradeDate: string | null;
  patienceLevel: string;
  patienceTier: "novice" | "intermediate" | "advanced" | "master";
  badgeName: string;
  badgeEmoji: string;
  estimatedFrictionSaved: number;
  inactionDividendDollar: number;
  inactionDividendPct: number;
  encouragement: string;
};

export function recordTradeActivity(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_TRADE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function loadLastTradeTimestamp(): number {
  if (typeof window === "undefined") return Date.now() - 18 * 86400000;
  try {
    const raw = localStorage.getItem(LAST_TRADE_KEY);
    if (!raw) {
      // Default to 18 days ago if never recorded so new users see an initial patience score
      const fallback = Date.now() - 18 * 86400000;
      localStorage.setItem(LAST_TRADE_KEY, String(fallback));
      return fallback;
    }
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : Date.now() - 18 * 86400000;
  } catch {
    return Date.now() - 18 * 86400000;
  }
}

export function calculateInactionDividend(
  bookValue: number,
  totalGainDollar: number,
  totalCostBasis: number
): PatienceMetrics {
  const lastTradeTime = loadLastTradeTimestamp();
  const elapsedMs = Math.max(0, Date.now() - lastTradeTime);
  const daysWithoutTrading = Math.max(1, Math.floor(elapsedMs / 86400000));

  const lastTradeDate = new Date(lastTradeTime).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Estimated slippage, spread, and timing churn saved (roughly ~0.03% per day not overtrading)
  const estimatedFrictionSaved = Math.round(
    bookValue * Math.min(0.08, daysWithoutTrading * 0.0003)
  );

  // Pro-rated share of total gains attributed to undisturbed holding period
  const holdingRatio = Math.min(1, daysWithoutTrading / 365);
  const inactionDividendDollar =
    totalGainDollar > 0
      ? Math.round(totalGainDollar * Math.max(0.1, holdingRatio))
      : 0;

  const inactionDividendPct =
    totalCostBasis > 0 ? (inactionDividendDollar / totalCostBasis) * 100 : 0;

  let patienceLevel = "Starting out";
  let patienceTier: PatienceMetrics["patienceTier"] = "novice";
  let badgeName = "Patient Watcher";
  let badgeEmoji = "🛡️";
  let encouragement = "The first week of sitting on your hands is always the hardest.";

  if (daysWithoutTrading >= 90) {
    patienceLevel = "Buffett-Grade Patience";
    patienceTier = "master";
    badgeName = "Compound Master";
    badgeEmoji = "👑";
    encouragement = "Zero unforced errors for over a quarter. Your capital is working uninterrupted.";
  } else if (daysWithoutTrading >= 30) {
    patienceLevel = "Conviction Compounding";
    patienceTier = "advanced";
    badgeName = "Iron Hands";
    badgeEmoji = "💎";
    encouragement = "A full month of discipline. You let compound interest do the heavy lifting.";
  } else if (daysWithoutTrading >= 14) {
    patienceLevel = "Discipline Builder";
    patienceTier = "intermediate";
    badgeName = "Steady Compounder";
    badgeEmoji = "🧘";
    encouragement = "Two weeks without reactionary trading. The noise did not shake your thesis.";
  } else if (daysWithoutTrading >= 7) {
    patienceLevel = "Gaining Rhythm";
    patienceTier = "novice";
    badgeName = "Calm Operator";
    badgeEmoji = "🌱";
    encouragement = "One solid week of patience. Doing nothing is often the highest-ROI trade.";
  }

  return {
    daysWithoutTrading,
    lastTradeDate,
    patienceLevel,
    patienceTier,
    badgeName,
    badgeEmoji,
    estimatedFrictionSaved,
    inactionDividendDollar,
    inactionDividendPct,
    encouragement,
  };
}
