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
What should this person watch today, what can they ignore, and is there one thing worth doing or is the move "do nothing".
Do not recap yesterday's regular session. Overnight and today's calendar only.`,
  close: `This is the after-close note. Recap the day for THIS book.
What actually happened, who did it, and whether the reason they own the loud name still holds.
No new trade plan unless the day's facts changed the story.`,
  sunday: `This is the Sunday note. Cover the week, then look a couple of weeks out.
How the week treated this book, what that means, and one or two concrete ideas for the next stretch (add on a dip, wait, don't chase, watch a report).
Longer view than the weekday notes. Still plain speech.`,
};

/** Phrases that only show up when the model dumps the prompt instead of the note. */
const LEAK = [
  /banned words/i,
  /cashtags?/i,
  /no em[- ]dash/i,
  /avoid em[- ]dash/i,
  /avoid en dash/i,
  /the instruction says/i,
  /we need to produce/i,
  /sunday note block/i,
  /morning note block/i,
  /no greeting/i,
  /sign-off/i,
  /hard rules/i,
  /as an AI/i,
  /do not invent holdings/i,
  /use only names from facts/i,
  /tickers as cashtags/i,
  /4\s*(?:to|-)\s*6 short sentences/i,
  /2 or 3 short sentences/i,
  /3 or 4 short sentences/i,
  /12-year-old/i,
  /75-year-old/i,
  /working vocabulary/i,
  /plan out loud/i,
  /restate these rules/i,
  /list words to avoid/i,
  /MARGUS_PERSONA/i,
];

export function looksLikePromptLeak(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  return LEAK.some((re) => re.test(s));
}

/** Deterministic stand-in when the model is down or dumps the prompt. */
export function fallbackNoteTake(r: NoteReport): string {
  const parts: string[] = [];
  if (r.kind === "sunday") {
    if (r.insights[0]) parts.push(r.insights[0]);
    if (r.perspective[0]) parts.push(r.perspective[0]);
    const idea = r.weekNotes[0];
    if (idea?.actionLine) {
      parts.push(`${cashtag(idea.ticker)}. ${idea.actionLine}`);
    }
  } else if (r.kind === "morning") {
    if (r.watches[0]?.line) parts.push(r.watches[0].line);
    if (r.insights[0] && r.insights[0] !== r.watches[0]?.line) {
      parts.push(r.insights[0]);
    }
  } else {
    if (r.thesis?.pulseLine) parts.push(r.thesis.pulseLine);
    if (r.insights[0]) parts.push(r.insights[0]);
  }
  const text = parts.filter(Boolean).join(" ").trim();
  if (text.length >= 20 && !looksLikePromptLeak(text)) return text;
  return r.lead;
}

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
        r.thesis.ownerThesis ? `Thesis: ${r.thesis.ownerThesis}` : null,
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

function acceptNote(text: string): string | null {
  const clean = humanizeMargusText(text.replace(/\s+/g, " ").trim());
  if (clean.length < 20) return null;
  if (looksLikePromptLeak(clean)) return null;
  return clean.length > 900 ? `${clean.slice(0, 880).trim()}.` : clean;
}

export async function writeMargusNoteTake(
  report: NoteReport
): Promise<string | null> {
  if (chatIsBusy()) return fallbackNoteTake(report);
  if (!beginBackgroundLlm()) return fallbackNoteTake(report);
  const chain = buildAdvisorProviderChain();
  if (chain.length === 0) {
    endBackgroundLlm();
    return fallbackNoteTake(report);
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

Write the finished note only. First word is the first word of the note.
Do not restate these rules. Do not list words to avoid. Do not plan out loud.`,
          prompt: facts(report),
          maxOutputTokens: report.kind === "sunday" ? 220 : 160,
          abortSignal: signal,
        }),
      { deadlineAt: Date.now() + 22_000 }
    );
    return acceptNote(text) ?? fallbackNoteTake(report);
  } catch (err) {
    console.error("Margus note take failed", err);
    return fallbackNoteTake(report);
  } finally {
    endBackgroundLlm();
  }
}
