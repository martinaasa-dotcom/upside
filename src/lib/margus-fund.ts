import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import { z } from "zod";

export const MARGUS_FUND_START_CAPITAL = 50_000;

export type FundHoldingStatus = "open" | "closed";

export type FundHolding = {
  id: string;
  ticker: string;
  shares: number;
  cost_basis: number;
  entry_date: string;
  thesis: string;
  target_timeframe: string | null;
  exit_plan: string | null;
  status: FundHoldingStatus;
  closed_at: string | null;
  exit_reasoning: string | null;
  realized_pnl: number | null;
};

export type FundReport = {
  id: string;
  report_date: string;
  headline: string;
  body: string;
  actions: FundAction[];
  portfolio_value: number;
  cash: number;
  day_change_dollar: number | null;
  day_change_pct: number | null;
  total_return_pct: number | null;
  created_at: string;
};

export type FundAction = {
  type: "hold" | "trim" | "add" | "exit" | "buy";
  ticker: string;
  reasoning: string;
  shares?: number;
  price?: number;
  dollarAmount?: number;
};

/** Live-priced view of a holding, built right before asking Margus to decide. */
export type PricedHolding = FundHolding & {
  price: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  daysHeld: number;
};

const fundDecisionSchema = z.object({
  marketNote: z
    .string()
    .describe(
      "1-2 sentences on the broad tape today relevant to this book specifically -- not a generic market wrap."
    ),
  holdingDecisions: z
    .array(
      z.object({
        ticker: z.string(),
        action: z.enum(["hold", "trim", "add", "exit"]),
        fraction: z
          .number()
          .min(0)
          .max(1)
          .nullable()
          .describe(
            "For trim/add only: fraction of CURRENT shares to sell (trim) or buy more of relative to current position size (add). Null for hold/exit."
          ),
        reasoning: z
          .string()
          .describe(
            "1-2 sentences, specific to this ticker's thesis/timeline/price action today -- never a generic filler line, even for hold."
          ),
      })
    )
    .describe(
      "Exactly one entry per currently open holding listed below, same tickers, every one reviewed even if the action is hold."
    ),
  newPositions: z
    .array(
      z.object({
        ticker: z.string(),
        companyName: z.string(),
        thesis: z
          .string()
          .describe(
            "2-3 sentences: the specific growth driver, moat, or mispricing. Not momentum, not hype, not 'everyone is talking about it.'"
          ),
        targetTimeframe: z
          .string()
          .describe("e.g. '3-6 months', '12-18 months'"),
        exitPlan: z
          .string()
          .describe(
            "The concrete condition that ends this trade: a price/return target, a thesis-break condition, or a timeframe -- stated specifically, not vaguely."
          ),
        allocationDollars: z
          .number()
          .positive()
          .describe("Dollar amount of available cash to deploy into this."),
      })
    )
    .max(2)
    .describe(
      "0-2 brand-new positions to open today. Leave empty most days -- only names that genuinely clear a high bar today, never a position just to have news to report."
    ),
  headline: z
    .string()
    .describe("One short, punchy sentence for today's report title."),
  closingNote: z
    .string()
    .describe(
      "1-2 sentences closing today's report -- what you're watching next. Short."
    ),
});

export type FundDecision = z.infer<typeof fundDecisionSchema>;

export { fundDecisionSchema };

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * System + user prompt for the daily decision call. Reuses MARGUS_PERSONA
 * verbatim for voice/philosophy consistency with the rest of the app, with
 * fund-specific rules layered on top (paper money, position sizing,
 * "review every holding" requirement).
 */
export function buildFundSystemPrompt(): string {
  return `${MARGUS_PERSONA}

## This specific job: managing your own paper portfolio
You run a single, fully simulated (paper money) portfolio that started at ${money(
    MARGUS_FUND_START_CAPITAL
  )} and is shown publicly as a daily, followable feed — think of it like a public "AI managed portfolio" account. People may glance at this for ideas, so:
- Every position needs a genuine, specific, fundamentals-based thesis (growth drivers, moat, unit economics, TAM) — never momentum, never "it's up a lot," never because it's trending.
- Every new position needs a concrete timeframe and a concrete exit condition (a price/return level, a thesis-break condition, or a hard time stop) decided at entry, not improvised later.
- Review EVERY currently open holding, every day, even when the action is "hold" — and when it's hold, say specifically why the original thesis and timeline still stand, not a generic "staying the course" line.
- Position sizing discipline: don't let any single new position exceed roughly 25% of total portfolio value, and don't deploy all available cash even on a great idea — leave room to be wrong and to add later.
- Most days should have zero or one action. A portfolio that trades every single day isn't disciplined, it's noisy — only act when something genuinely changed (thesis progressed/broke, timeline elapsed, price hit your own stated level) or a new idea truly clears the bar.
- Keep every field SHORT. This report gets read daily — nobody wants a wall of text. 1-3 sentences per field, always.`;
}

const weeklyRecapSchema = z.object({
  headline: z
    .string()
    .describe("One punchy sentence capturing the week — the story, not the stat line."),
  body: z
    .string()
    .describe(
      "4-8 sentences: a genuine step back on how the week went — your biggest win, your biggest miss or lesson, how the numbers below shaped your thinking, and what you're specifically watching next week. This is the reflection, not a re-listing of each day's actions."
    ),
});

export type WeeklyRecapDecision = z.infer<typeof weeklyRecapSchema>;

export { weeklyRecapSchema };

/** Reuses the same persona for voice consistency, with a distinct framing:
 * this is the reflective step-back, not another daily decision. */
export function buildWeeklyRecapSystemPrompt(): string {
  return `${MARGUS_PERSONA}

## This specific job: your weekly step-back
Once a week (Friday's close) you write a short, honest recap of your own paper portfolio's week — not a re-listing of each day's trades, but a genuine reflection: what you got right, what you got wrong or would do differently, how you stack up against SPY, and what specifically you're watching next week. The numbers below are already computed and correct — don't recompute or contradict them, just make sense of them in your own voice. Keep it short: this gets read once a week, not once a day, but it should still feel like a real strategist thinking out loud, not a template.`;
}

export function buildWeeklyRecapUserPrompt(input: {
  weekEnding: string;
  portfolioValueStart: number;
  portfolioValueEnd: number;
  weekReturnPct: number;
  spyWeekReturnPct: number | null;
  currentHoldings: PricedHolding[];
  weekActions: { date: string; type: string; ticker: string; reasoning: string }[];
}): string {
  const {
    weekEnding,
    portfolioValueStart,
    portfolioValueEnd,
    weekReturnPct,
    spyWeekReturnPct,
    currentHoldings,
    weekActions,
  } = input;

  const actionsBlock = weekActions.length
    ? weekActions
        .map((a) => `- ${a.date}: ${a.type.toUpperCase()} ${a.ticker} — ${a.reasoning}`)
        .join("\n")
    : "No trades this week — held the book as-is.";

  const holdingsBlock = currentHoldings
    .map(
      (h) =>
        `- ${h.ticker}: ${h.unrealizedPnlPct >= 0 ? "+" : ""}${(h.unrealizedPnlPct * 100).toFixed(1)}% since entry`
    )
    .join("\n");

  return `Week ending: ${weekEnding}

Portfolio value: ${money(portfolioValueStart)} -> ${money(portfolioValueEnd)} (${weekReturnPct >= 0 ? "+" : ""}${(weekReturnPct * 100).toFixed(1)}%)
${spyWeekReturnPct != null ? `SPY this week: ${spyWeekReturnPct >= 0 ? "+" : ""}${(spyWeekReturnPct * 100).toFixed(1)}%` : "SPY comparison not available yet"}

## This week's actions
${actionsBlock}

## Current holdings, unrealized
${holdingsBlock}

Write this week's recap.`;
}

export function buildFundUserPrompt(input: {
  today: string;
  cash: number;
  holdings: PricedHolding[];
  totalValue: number;
  spyMovePct: number | null;
  fearGreed: { score: number; rating: string } | null;
  recentHeadlines: string[];
}): string {
  const { today, cash, holdings, totalValue, spyMovePct, fearGreed, recentHeadlines } =
    input;

  const holdingsBlock =
    holdings.length === 0
      ? "No open positions — 100% cash right now."
      : holdings
          .map((h) => {
            return [
              `### ${h.ticker}`,
              `- Entry: ${h.entry_date} (${h.daysHeld}d ago) at $${h.cost_basis.toFixed(2)}, now $${h.price.toFixed(2)} (${h.unrealizedPnlPct >= 0 ? "+" : ""}${(h.unrealizedPnlPct * 100).toFixed(1)}%, ${money(h.unrealizedPnl)})`,
              `- Position size: ${money(h.marketValue)} (${((h.marketValue / totalValue) * 100).toFixed(1)}% of book)`,
              `- Original thesis: ${h.thesis}`,
              `- Target timeframe: ${h.target_timeframe ?? "not set"}`,
              `- Exit plan: ${h.exit_plan ?? "not set"}`,
            ].join("\n");
          })
          .join("\n\n");

  const contextLines = [
    `Today: ${today}`,
    spyMovePct != null
      ? `S&P 500 today: ${spyMovePct >= 0 ? "+" : ""}${(spyMovePct * 100).toFixed(2)}%`
      : null,
    fearGreed
      ? `Fear & Greed: ${fearGreed.score} (${fearGreed.rating})`
      : null,
  ].filter(Boolean);

  const recapBlock = recentHeadlines.length
    ? `Recent days, for continuity (don't repeat, don't contradict without explaining why):\n${recentHeadlines.map((h) => `- ${h}`).join("\n")}`
    : "No prior reports yet — this may be day one.";

  return `${contextLines.join("\n")}

Cash available: ${money(cash)}
Total portfolio value: ${money(totalValue)}

## Current holdings
${holdingsBlock}

## Recent history
${recapBlock}

Decide today's actions. Review every open holding above. Only add a new position if something genuinely clears your bar today — most days that's zero new positions.`;
}
