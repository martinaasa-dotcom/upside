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
What should this person watch today, what can they ignore, and is there one check worth sitting with or is the move to do nothing.
Never write orders. No "do not add", "sell some", "look to add", "buy more". Frame as a check. Always their call.
Do not recap yesterday's regular session. Overnight and today's calendar only.`,
  close: `This is the after-close note. Recap the day for THIS portfolio.
What actually happened, who did it, and whether the reason they own the loud name still holds.
No new trade plan unless the day's facts changed the story. Never write orders. Frame as a check. Always their call.`,
  sunday: `This is the Sunday note. Write a complete thought, not a pile of leftover lines.

Part 1. A short story of the week for this portfolio. Two to four sentences that connect. What happened, which names did it, what that means from here. Read it out loud. If it sounds like three unrelated texts, rewrite it.

Part 2. A blank line, then a bullet list. One bullet per name under Loud movers. Every one of them. Start each line with "- " then the cashtag, the week's move, and one short clause. If Loud movers is empty, skip the list.

Do not copy the Worth noticing or next-weeks lines. Write your own story from the numbers. Say "your portfolio", never book or sheet.
Never write orders. No "do not add", "sell some", "look to add". Frame as a check. Always their call.`,
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
  /two to four sentences/i,
  /write a complete thought/i,
  /pile of leftover/i,
  /loud movers \(name every/i,
  /background only, do not paste/i,
  /part 1\./i,
  /part 2\./i,
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

function fallbackSunday(r: NoteReport): string {
  const loud = r.loudMovers.length > 0 ? r.loudMovers : r.movers;
  const best = [...loud].sort((a, b) => b.pct - a.pct)[0];
  const worst = [...loud].sort((a, b) => a.pct - b.pct)[0];
  const week =
    r.todayPct != null
      ? `Your portfolio was ${pct(r.todayPct)} this week, ${money(r.todayDollar)}.`
      : `Your portfolio moved ${money(r.todayDollar)} this week.`;
  const bits = [week];
  if (
    best &&
    best.pct > 0 &&
    worst &&
    worst.pct < 0 &&
    worst.ticker !== best.ticker
  ) {
    bits.push(
      `${cashtag(best.ticker)} led the way up. ${cashtag(worst.ticker)} was the drop.`
    );
  } else if (best && best.pct > 0) {
    bits.push(`${cashtag(best.ticker)} did most of the work.`);
  } else if (worst && worst.pct < 0) {
    bits.push(`${cashtag(worst.ticker)} was the drop.`);
  }
  const top = r.weights[0];
  if (top && top.weight >= 0.35) {
    bits.push(
      `${cashtag(top.ticker)} is ${Math.round(Math.abs(top.weight) * 100)}% of your portfolio, so the next stretch mostly rides on it.`
    );
  }
  const story = bits.join(" ");
  if (loud.length === 0) return story;
  const bullets = loud.map(
    (m) => `- ${cashtag(m.ticker)} ${pct(m.pct)}, ${money(m.dollar)}`
  );
  return `${story}\n\n${bullets.join("\n")}`;
}

/** Deterministic stand-in when the model is down or dumps the prompt. */
export function fallbackNoteTake(r: NoteReport): string {
  if (r.kind === "sunday") {
    return humanizeMargusText(fallbackSunday(r));
  }
  const parts: string[] = [];
  if (r.kind === "morning") {
    if (r.watches[0]?.line) parts.push(r.watches[0].line);
    if (r.insights[0] && r.insights[0] !== r.watches[0]?.line) {
      parts.push(r.insights[0]);
    }
  } else {
    if (r.thesis?.pulseLine) parts.push(r.thesis.pulseLine);
    if (r.insights[0]) parts.push(r.insights[0]);
  }
  const text = humanizeMargusText(parts.filter(Boolean).join(" ").trim());
  if (text.length >= 20 && !looksLikePromptLeak(text)) return text;
  return humanizeMargusText(r.lead);
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
    `Portfolio: $${Math.round(r.book).toLocaleString("en-US")} across ${r.nameCount} names`,
    `${r.todayLabel}: ${money(r.todayDollar)}${r.todayPct != null ? ` (${pct(r.todayPct)})` : ""}`,
  ];
  const loud = r.loudMovers.length > 0 ? r.loudMovers : r.movers;
  if (loud[0]) {
    lines.push(
      "Loud movers (name every one of these in the bullet list):",
      ...loud.map(
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
    lines.push("Background only, do not paste:", ...r.perspective);
  }
  if (r.weekNotes[0]) {
    lines.push(
      "Background only, do not paste:",
      ...r.weekNotes.map((n) => `  ${cashtag(n.ticker)} ${n.actionLine}`)
    );
  }
  if (r.insights[0]) {
    lines.push("Background only, do not paste:", ...r.insights.map((l) => `  ${l}`));
  }
  return lines.filter((x): x is string => Boolean(x)).join("\n");
}

function acceptNote(text: string): string | null {
  const lined = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trimEnd())
    .join("\n")
    .trim();
  const clean = humanizeMargusText(lined);
  if (clean.length < 40) return null;
  if (looksLikePromptLeak(clean)) return null;
  return clean.length > 1800 ? clean.slice(0, 1760).trim() : clean;
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
          maxOutputTokens: report.kind === "sunday" ? 480 : 200,
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
