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

Paragraph 1. What is doing the work this morning (overnight move beats a later earnings date). Name the cashtag. Let the move play out. Buying more here is how people chase a run. Always their call.
Paragraph 2. The rest can look fine and the mix still be the real issue. Two sentences. Name the percent once. Name the missing group in kitchen-table words. Do not paste the insight lines.
Paragraph 3. If that group has a bad year, the whole portfolio has a bad year. We do not need a panic move before the open. Sit with the weight. Plan the mix when we are not in a rush.

Never write orders. No "do not buy more", "no trades", "do not add", "sell some", "look to add". Overnight and today's calendar only. Do not recap yesterday's regular session.`,
  close: `This is the after-close note. Recap the day for THIS portfolio in the same partner voice, we/us/our, three short paragraphs with a blank line between them.

Paragraph 1. Who did the work today. Name the cashtag. Let the move play out. Buying more here is how people chase a run.
Paragraph 2. The mix if it matters. Two sentences. Name the percent once. Name the missing group. Do not paste the insight lines.
Paragraph 3. If that group has a bad year, the whole portfolio has a bad year. We do not need a panic move tonight. Sit with the weight.

Never write orders. No new trade plan unless the day's facts changed the story.`,
  sunday: `This is the Sunday note. Same partner voice as the morning letter, we/us/our, three short paragraphs with a blank line between them. The loud-mover numbers are already a table in the email. Do not make a second list of those names.

Paragraph 1. The week for our portfolio. What happened, which names did it, what that means from here. Two to four sentences that connect. Do not list the table again.
Paragraph 2. The mix if it matters. Two sentences. Name the percent once. Name the missing group. Do not paste the insight lines.
Paragraph 3. If that group has a bad year, the whole portfolio has a bad year. We do not need a new plan this weekend. Sit with the weight.

Never write orders.`,
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

function firstSentences(s: string, n: number): string {
  const parts = s.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
  if (!parts) return s.trim();
  return parts.slice(0, n).join(" ").replace(/ {2,}/g, " ").trim();
}

function mixBody(r: NoteReport): string | null {
  const mix = r.insights[1] ?? r.insights[0];
  if (!mix) return null;
  return firstSentences(weVoice(mix), 2);
}

function mixClose(when: "open" | "tonight" | "weekend"): string {
  const rush =
    when === "open"
      ? "We don't need a panic move before the open."
      : when === "tonight"
        ? "We don't need a panic move tonight."
        : "We don't need a new plan this weekend.";
  return `If that group has a bad year, the whole portfolio has a bad year. ${rush} Sit with the weight. Plan the mix when we're not in a rush.`;
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
  const mix = mixBody(r);
  const p1 = bits.join(" ");
  const p2 = mix
    ? `The rest of the week can look fine and the mix still be the real issue. ${mix}`
    : null;
  const p3 = mix
    ? mixClose("weekend")
    : "We don't need a new plan this weekend. Sit with the weight.";
  return [p1, p2, p3].filter(Boolean).join("\n\n");
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
  const gap = r.movers[0];
  let p1: string;
  if (r.kind === "morning") {
    if (gap && Math.abs(gap.pct) >= 0.02) {
      p1 = `${cashtag(gap.ticker)} is the only name doing any real work for us this morning. Let the move play out. Buying more here is how people chase a run.`;
    } else if (ticker && watch?.line && /reports today/i.test(watch.line)) {
      p1 = `${ticker} reports today. That's the thing to watch. Let the rest sit.`;
    } else if (ticker) {
      p1 = `${ticker} is the only name doing any real work for us this morning. Let the move play out. Buying more here is how people chase a run.`;
    } else {
      p1 = weVoice(r.lead);
    }
  } else if (gap && Math.abs(gap.pct) >= 0.01) {
    p1 = `${cashtag(gap.ticker)} did the work today. Let the move play out. Buying more here is how people chase a run.`;
  } else if (r.thesis) {
    const pulse = r.thesis.pulseLine
      ? weVoice(r.thesis.pulseLine)
      : "The reason we own it still looks like the same story.";
    p1 = `${cashtag(r.thesis.ticker)} did the work today. ${pulse}`;
  } else {
    p1 = weVoice(r.lead);
  }
  const mix = mixBody(r);
  const p2 = mix
    ? `The rest of the portfolio looks fine right now, but the mix is the real issue. ${mix}`
    : null;
  const p3 = mix
    ? mixClose(r.kind === "morning" ? "open" : "tonight")
    : r.kind === "morning"
      ? "We don't need a panic move before the open. Sit with the weight."
      : "We don't need a panic move tonight. Sit with the weight.";
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
      "Loud movers (already a table in the email, do not list them again):",
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
