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
  morning: `This is the morning note. Look ahead, not back. Write like a partner Slack, we/us/our, three short paragraphs with a blank line between them.

Paragraph 1. What is doing the work this morning. Name the cashtag. Let the move play out. Buying more here is how people chase a run. Always their call.
Paragraph 2. The rest can look fine and the mix still be the real issue. Name the percent once. Name the missing group in kitchen-table words. Do not paste the Worth noticing lines.
Paragraph 3. We do not need a panic move before the open. Sit with the weight. Plan the mix when we are not in a rush.

Never write orders. No "do not buy more", "no trades", "do not add", "sell some", "look to add". Overnight and today's calendar only. Do not recap yesterday's regular session.`,
  close: `This is the after-close note. Recap the day for THIS portfolio in the same partner voice, we/us/our, three short paragraphs with a blank line between them.

Paragraph 1. Who did the work today, and whether the reason we own the loud name still holds.
Paragraph 2. The mix if it matters. Name the percent once.
Paragraph 3. What we do not need to rush tonight.

Never write orders. No new trade plan unless the day's facts changed the story.`,
  sunday: `This is the Sunday note. Write a complete thought, not a pile of leftover lines. Partner voice: we, us, our.

Part 1. A short story of the week for our portfolio. Two to four sentences that connect. What happened, which names did it, what that means from here. Read it out loud. If it sounds like three unrelated texts, rewrite it.

Part 2. A blank line, then a bullet list. One bullet per name under Loud movers. Every one of them. Start each line with "- " then the cashtag, the week's move, and one short clause. If Loud movers is empty, skip the list.

Do not copy the Worth noticing or next-weeks lines. Write your own story from the numbers. Never write orders.`,
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
  /partner Slack/i,
  /three short paragraphs/i,
  /Paragraph 1\./i,
  /Paragraph 2\./i,
  /Paragraph 3\./i,
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
      ? `Our portfolio was ${pct(r.todayPct)} this week, ${money(r.todayDollar)}.`
      : `Our portfolio moved ${money(r.todayDollar)} this week.`;
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
      `${cashtag(top.ticker)} is ${Math.round(Math.abs(top.weight) * 100)}% of our portfolio, so the next stretch mostly rides on it.`
    );
  }
  const story = bits.join(" ");
  if (loud.length === 0) return story;
  const bullets = loud.map(
    (m) => `- ${cashtag(m.ticker)} ${pct(m.pct)}, ${money(m.dollar)}`
  );
  return `${story}\n\n${bullets.join("\n")}`;
}

function weVoice(s: string): string {
  return s
    .replace(/\byour portfolio\b/gi, "our portfolio")
    .replace(/\bthis portfolio\b/gi, "our portfolio")
    .replace(/\byou barely\b/gi, "we barely")
    .replace(/\byou hold\b/gi, "we hold")
    .replace(/\bIf you did not mean\b/gi, "If we did not mean");
}

function fallbackWeekday(r: NoteReport): string {
  const watch = r.watches[0];
  const ticker = watch?.ticker ? cashtag(watch.ticker) : null;
  let p1: string;
  if (r.kind === "morning") {
    if (ticker && watch?.line && /reports today/i.test(watch.line)) {
      p1 = `${ticker} reports today. That's the thing to watch. Let the rest sit.`;
    } else if (ticker) {
      p1 = `${ticker} is the only name doing any real work for us this morning. Let the move play out. Buying more here is how people chase a run.`;
    } else {
      p1 = weVoice(r.lead);
    }
  } else if (r.thesis) {
    const pulse = r.thesis.pulseLine
      ? weVoice(r.thesis.pulseLine)
      : "The reason we own it still looks like the same story.";
    p1 = `${cashtag(r.thesis.ticker)} did the work today. ${pulse}`;
  } else {
    p1 = weVoice(r.lead);
  }
  const mix = r.insights[1] ?? r.insights[0];
  const p2 = mix
    ? `The rest of the portfolio looks fine right now, but the mix is the real issue. ${weVoice(mix)}`
    : null;
  const p3 =
    r.kind === "morning"
      ? "We don't need a panic move before the open. Sit with the weight. Plan the mix when we're not in a rush."
      : "We don't need a panic move tonight. Sit with the weight. Plan the mix when we're not in a rush.";
  return [p1, p2, p3].filter(Boolean).join("\n\n");
}

/** Deterministic stand-in when the model is down or dumps the prompt. */
export function fallbackNoteTake(r: NoteReport): string {
  if (r.kind === "sunday") {
    return humanizeMargusText(fallbackSunday(r));
  }
  const text = humanizeMargusText(fallbackWeekday(r));
  if (text.length >= 20 && !looksLikePromptLeak(text)) return text;
  return humanizeMargusText(weVoice(r.lead));
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
          maxOutputTokens: report.kind === "sunday" ? 560 : 420,
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
