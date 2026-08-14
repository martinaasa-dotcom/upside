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
      "One plain sentence on the book's big lines, lead with any sharp drops and whether they're noise or thesis risk."
    ),
  checks: z.array(
    z.object({
      ticker: z.string(),
      situation: z
        .array(z.string())
        .min(2)
        .max(4)
        .describe(
          "2-4 bullets explaining the current situation, grounded in the supplied headlines. One short line each, under about 18 words, no bullet longer than a single clause plus its consequence. Plain English, no preamble, no trailing summary bullet."
        ),
      moveReason: z
        .string()
        .describe(
          "One sentence on what drove the move (cite news when possible)."
        ),
      thesisStatus: z
        .enum(["intact", "watch", "broken"])
        .describe(
          "Be conservative. intact = the reason you own it hasn't changed, including a normal red day, sector-wide weakness, or profit-taking. watch = something worth tracking emerged but hasn't invalidated the story. broken = the actual reason you bought this is gone (guidance genuinely cut, moat broken, fraud/restatement). Rare, and must pair with action=sell, never hold/add/trim. If you'd still hold it, use watch."
        ),
      action: z
        .enum(["add", "hold", "trim", "sell", "watch"])
        .describe(
          "add = deploy on intact thesis dip. hold = no change, thesis intact or watch, never broken. trim = disciplined profit-taking on a winner that ran too hot (thesis intact or at most watch), never a broken thesis. sell = the thesis is broken and you're exiting, not taking profit. watch = wait for clarity."
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
          'Concrete, self-explanatory add trigger, e.g. "Add now ~$X · then more if it drops to ~$Y". Spell out that Y is a SECOND, lower buy trigger, never just "stagger below" jargon. Required when action=add or thesis intact on a dip. Empty only for trim. Not greedy, Y within ~5–12% below spot.'
        ),
      earningsNote: z
        .string()
        .describe(
          "Recent/upcoming earnings in plain English; empty string if not relevant."
        ),
      verdict: z
        .string()
        .describe(
          "One sentence tying action + addLevel to the thesis, not generic hold language."
        ),
      thesisBreak: z
        .string()
        .describe(
          "One or two short sentences. Concrete and falsifiable: what would actually invalidate the reason this name is in the book. Not 'the stock goes down'. Example: capacity bookings stall for two quarters, or the core contract gets cancelled. Required on every ticker."
        ),
    })
  ),
});
