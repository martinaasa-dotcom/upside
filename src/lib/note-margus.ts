/** Margus's short take for a daily / Sunday note. Fail open: skip if the model is down. */

import { generateText } from "ai";
import { humanizeMargusText } from "@/lib/ai/humanize-copy";
import {
  beginBackgroundLlm,
  chatIsBusy,
  endBackgroundLlm,
} from "@/lib/ai/llm-slots";
import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import {
  buildAdvisorProviderChain,
  withAdvisorFallback,
} from "@/lib/ai/model";
import { cashtag } from "@/lib/format";
import type { NoteReport } from "@/lib/note-report";

const JOB: Record<NoteReport["kind"], string> = {
  morning: `This is the morning note. Look ahead, not back.
Write 2 or 3 short sentences. What should this person watch today, what can they ignore, and is there one thing worth doing or is the move "do nothing".
Do not recap yesterday's regular session. Overnight and today's calendar only.`,
  close: `This is the after-close note. Recap the day for THIS book.
Write 3 or 4 short sentences. What actually happened, who did it, and whether the reason they own the loud name still holds.
No new trade plan unless the day's facts changed the story.`,
  sunday: `This is the Sunday note. Cover the week, then look a couple of weeks out.
Write 4 to 6 short sentences. How the week treated this book, what that means, and one or two concrete ideas for the next couple of weeks (add on a dip, wait, don't chase, watch a report).
Longer view than the weekday notes. Still plain speech.`,
};

function money(n: number): string {
  const grouped = String(Math.round(Math.abs(n))).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ","
  );
  if (n > 0) return `+$${grouped}`;
  if (n < 0) return `-$${grouped}`;
  return `$${grouped}`;
}

function pct(n: number): string {
  const v = `${(Math.abs(n) * 100).toFixed(1)}%`;
  if (n > 0) return `+${v}`;
  if (n < 0) return `-${v}`;
  return v;
}

function facts(r: NoteReport): string {
  const lines = [
    `Kind: ${r.kind}`,
    `Lead: ${r.lead}`,
    `Book: $${Math.round(r.book).toLocaleString("en-US")} across ${r.nameCount} names`,
    `${r.todayLabel}: ${money(r.todayDollar)}${r.todayPct != null ? ` (${pct(r.todayPct)})` : ""}`,
  ];
  if (r.movers[0]) {
    lines.push(
      "Movers:",
      ...r.movers
        .slice(0, 5)
        .map(
          (m) =>
            `  ${cashtag(m.ticker)} ${pct(m.pct)} ${money(m.dollar)} at $${m.price.toFixed(2)}`
        )
    );
  }
  if (r.weights[0]) {
    lines.push(
      "Weights:",
      ...r.weights.map(
        (w) => `  ${cashtag(w.ticker)} ${Math.round(Math.abs(w.weight) * 100)}%`
      )
    );
  }
  if (r.watches[0]) {
    lines.push("Watch / action lines:", ...r.watches.map((w) => `  ${w.line}`));
  }
  if (r.thesis) {
    lines.push(
      ...[
        `Focus: ${cashtag(r.thesis.ticker)}`,
        r.thesis.ownerThesis ? `Why they own it: ${r.thesis.ownerThesis}` : null,
        r.thesis.status ? `Pulse: ${r.thesis.status}` : null,
        r.thesis.pulseLine,
      ].filter((x): x is string => Boolean(x))
    );
  }
  if (r.perspective[0]) {
    lines.push("Already drafted next-weeks lines:", ...r.perspective);
  }
  if (r.weekNotes[0]) {
    lines.push(
      "Pulse for next week:",
      ...r.weekNotes.map((n) => `  ${cashtag(n.ticker)} ${n.actionLine}`)
    );
  }
  if (r.insights[0]) {
    lines.push("Worth noticing:", ...r.insights.map((l) => `  ${l}`));
  }
  return lines.filter((x): x is string => Boolean(x)).join("\n");
}

export async function writeMargusNoteTake(
  report: NoteReport
): Promise<string | null> {
  if (chatIsBusy()) return null;
  if (!beginBackgroundLlm()) return null;
  const chain = buildAdvisorProviderChain();
  if (chain.length === 0) {
    endBackgroundLlm();
    return null;
  }
  try {
    const { text } = await withAdvisorFallback(
      chain,
      (model, _id, signal) =>
        generateText({
          model,
          system: `${MARGUS_PERSONA}

## This email
You are writing one block for an Upside Lab inbox note. The numbers and lists are already in the email. You add the human read.

${JOB[report.kind]}

Hard rules for this block:
- Plain English a 12-year-old and a 75-year-old both get.
- Never say "tape", "sleeve", "marks", "thesis", "conviction", "digestion", "beta", or "rotation".
- No greeting, no sign-off, no "as an AI".
- Tickers as cashtags: $NBIS, not NBIS.
- Only use names in the facts. Do not invent holdings.
- Educational scenario, not advice. Do not say "you should buy" as an order. "I'd look to add if it dips" is fine.
- If the day or week is quiet, say so and stop. Do not invent drama.
- If "Worth noticing" mentions money moving between groups, use it. Do not invent new tickers.`,
          prompt: facts(report),
          maxOutputTokens: report.kind === "sunday" ? 280 : 180,
          abortSignal: signal,
        }),
      { deadlineAt: Date.now() + 22_000 }
    );
    const clean = humanizeMargusText(text.replace(/\s+/g, " ").trim());
    if (clean.length < 20) return null;
    return clean.length > 900 ? `${clean.slice(0, 880).trim()}.` : clean;
  } catch (err) {
    console.error("Margus note take failed", err);
    return null;
  } finally {
    endBackgroundLlm();
  }
}
