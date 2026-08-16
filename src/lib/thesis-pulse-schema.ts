/**
 * Zod schema for the Thesis Pulse report, kept out of lib/thesis-pulse.ts
 * so it never reaches the browser.
 *
 * PulsePage, OverviewDashboard, and Dashboard all import candidate/cache
 * helpers from lib/thesis-pulse.ts, so a top-level `import { z }` there put
 * all of zod into the client bundle for code only the API route runs.
 */

import { z } from "zod";

export const pulseReportSchema = z.object({
  summary: z
    .string()
    .describe(
      "One short sentence on the portfolio as a whole. Name the names that moved 5% or more, up or down, and whether any call left Hold. Do not recap one ticker's news. That belongs on the card. Do not start with the sharp drop."
    ),
  checks: z.array(
    z.object({
      ticker: z.string(),
      situation: z
        .array(z.string())
        .min(2)
        .max(4)
        .describe(
          "2-4 bullets explaining THIS ticker's situation, grounded in its headlines. One short line each, under about 18 words, no bullet longer than a single clause plus its consequence. Unique to this name: do not reuse a bullet from another ticker in this report. Plain English, no preamble, no trailing summary bullet."
        ),
      moveReason: z
        .string()
        .describe(
          "One sentence on what drove THIS name's move. Cite a headline when you have one. Must not match any other ticker's moveReason in this report."
        ),
      thesisStatus: z
        .enum(["intact", "watch", "broken"])
        .describe(
          "Be conservative. intact = the reason you own it hasn't changed, including a normal red day, a green day that ran, sector-wide weakness, or taking a little profit. A trim into strength is intact, never watch. watch = something in the story is worth tracking, not a price that went up. broken = the actual reason you bought this is gone (guidance genuinely cut, staying power gone, fraud/restatement). Rare, and must pair with action=sell, never hold/add/trim. If you'd still hold it, use watch."
        ),
      action: z
        .enum(["add", "hold", "trim", "sell", "watch"])
        .describe(
          "add = buy more on an intact dip. hold = no change, reason intact or watch, never broken. trim = take some profit on a winner that ran too hot. Pair with intact. A run-up is the story working, never Thesis watch. sell = the reason is broken and you're exiting, not taking profit. watch = wait for clarity."
        ),
      trimPct: z
        .number()
        .min(5)
        .max(50)
        .nullable()
        .optional()
        .describe(
          "Only when action=trim: percent of position to trim as take-profit (e.g. 10, 15, 20). Null otherwise, including for sell."
        ),
      addLevel: z
        .string()
        .describe(
          'Concrete, self-explanatory add trigger, e.g. "Add now ~$X · then more if it drops to ~$Y". Spell out that Y is a SECOND, lower buy trigger, never just "stagger below" jargon. Required when action=add or the reason is intact on a dip. Empty only for trim. Not greedy, Y within ~5-12% below spot.'
        ),
      earningsNote: z
        .string()
        .describe(
          "Recent/upcoming earnings in plain English; empty string if not relevant."
        ),
      verdict: z
        .string()
        .describe(
          "One sentence tying action + addLevel/trimPct to why they own THIS name. Must not match any other ticker's verdict in this report. Name the company, the headline, or a concrete number. Never reuse a stock phrase like 'looks like a chase, not a new story' or 'this is a dip to add, not a sell' on a second name."
        ),
      thesisBreak: z
        .string()
        .describe(
          "One or two short sentences naming the actual thing that would kill why they own THIS name. Use their note, the sector, and headlines. Example: data-center bookings stall for two quarters. Empty if you cannot name something specific to this company or fund. Never a generic lost-customer / restatement / quiet-day line that could sit on every card."
        ),
    })
  ),
});
