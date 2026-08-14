/**
 * Single source of truth for "not financial advice" framing shown across
 * every AI-generated surface (Margus chat, Thesis Pulse, Forecast). Keep
 * this consistent — if the wording needs to change for legal reasons, it
 * should only need to change here.
 */

/** Compact, always-visible line for tight spaces (chat panel, cards). */
export const ADVICE_DISCLAIMER_SHORT =
  "Educational, not personalized investment advice. Always your call.";

/** Slightly longer version for section headers with more room. */
export const ADVICE_DISCLAIMER_LONG =
  "Educational scenarios generated from public data, not personalized investment advice. Nothing here accounts for your full financial picture or risk tolerance.";

/** For forecast/scenario-modeling surfaces specifically. */
export const FORECAST_DISCLAIMER =
  "Modeled scenarios for your own thinking, not personalized investment advice or a guarantee of future performance.";

/** Upside Fund, a fully simulated, paper-money portfolio managed
 * autonomously by Margus. Leads with WHO runs it (a common question for a
 * followable daily feed like this), then the same "not real, not advice"
 * emphasis used everywhere else. */
export const UPSIDE_PORTFOLIO_DISCLAIMER =
  "Managed autonomously by Margus, Upside's AI strategist. 100% simulated with paper money. Not a real fund, not a track record, and not a signal to copy trade-for-trade. Margus doesn't know your situation, risk tolerance, or timeline. Educational entertainment only.";
