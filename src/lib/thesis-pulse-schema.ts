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
        .string()
        .describe(
          "2–3 short sentences: current situation explainer using the supplied news headlines. Plain English."
        ),
      moveReason: z
        .string()
        .describe(
          "One sentence on what drove the move (cite news when possible)."
        ),
      thesisStatus: z.enum(["intact", "watch", "broken"]),
      action: z
        .enum(["add", "hold", "trim", "watch"])
        .describe(
          "add = deploy on intact thesis dip; hold = no change; trim = reduce; watch = wait for clarity."
        ),
      trimPct: z
        .number()
        .min(5)
        .max(50)
        .nullable()
        .optional()
        .describe(
          "Only when action=trim: percent of position to trim as take-profit (e.g. 10, 15, 20). Null otherwise."
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
    })
  ),
});
