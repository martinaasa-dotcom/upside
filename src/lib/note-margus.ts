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
import { fetchTickerNews } from "@/lib/market/ticker-context";
import type { NoteReport } from "@/lib/note-report";

const JOB: Record<NoteReport["kind"], string> = {
  morning: `This is the morning pre-market note. You/your. Four short paragraphs with a blank line between them. Varied sentence length. Candid, like a quick desk note. Never we/us/our.

Paragraph 1. The name that's moving overnight. Cashtag. The actual headline if facts give one, or the overnight number if they don't. Why it moved. Two or three sentences.
Then a blank line, then one line exactly: [[source: Publisher]] using the publisher from facts. Skip that line if facts say no headline. Never invent a publisher.
Paragraph 2. What that means for you. Tempting to jump in. Buying a gap like this is how people wreck what they paid. The move for you is doing nothing. Let the shares you already have run.
Paragraph 3. As for the rest of your portfolio. Name the percent once. Name the missing group. You don't need to chase fresh highs today. Do not paste the insight lines.
Paragraph 4. Nothing you need to do before the open. Enjoy your morning and let it play out.

Never invent news. Overnight and today's calendar only. Do not recap yesterday's regular session.
Never write orders. No "do not buy more", "no trades", "no moves", "hands off the buy button", "do not add", "sell some".`,
  close: `This is the after-the-close note. You/your. Four short paragraphs with a blank line between them. Same voice as the morning letter.

Paragraph 1. Who did the work today. Cashtag. The actual headline if facts give one. How much that name did versus the rest. Two or three sentences.
Then a blank line, then [[source: Publisher]] if facts give a publisher. Skip if none. Never invent it.
Paragraph 2. What that means for you. Holding off tonight is the smart read. Buying more after a surge is how people chase. Chasing a name that's already down is catching a drop with both hands. The move for you is doing nothing.
Paragraph 3. As for the rest of your portfolio. Name the percent once. Name the missing group. Do not paste the insight lines.
Paragraph 4. Your portfolio did its job today. Nothing you need to change tonight. Log off and let it sit.

Never write orders. Never we/us/our.`,
  sunday: `This is the Sunday weekly recap. You/your. Four short paragraphs with a blank line between them. The loud-mover numbers are already a table. Do not make a second list of those names.

Paragraph 1. Who stole the show this week. Cashtag. The actual headline if facts give one, and what that did to the week's number. Two or three sentences.
Then a blank line, then [[source: Publisher]] if facts give a publisher. Skip if none.
Paragraph 2. Looking at the rest of your portfolio. Name the percent once. Name the missing group. What slipped, what held. Do not paste the insight lines.
Paragraph 3. Holding steady through the headlines was the right read. Buying into a spike is how people chase. The plan for next week does not need a rewrite tonight.
Paragraph 4. Enjoy the rest of your Sunday. Nothing you need to do tonight.

Never invent news. Never write orders. Never we/us/our.`,
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
  /Paragraph 4\./i,
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
  return firstSentences(mix, 2);
}

function clipHeadline(title: string): string {
  const t = title.trim().replace(/[ \t]+/g, " ").replace(/[.,;:]+$/, "");
  if (t.length <= 160) return t;
  const cut = t.slice(0, 157);
  const at = cut.lastIndexOf(" ");
  return at > 80 ? cut.slice(0, at) : cut;
}

function sourceLine(r: NoteReport): string | null {
  const pub = r.news?.publisher?.trim();
  if (!pub) return null;
  return `[[source: ${pub}]]`;
}

function mixParagraph(r: NoteReport): string | null {
  const mix = mixBody(r);
  if (!mix) return null;
  return `As for the rest of your portfolio, ${mix.charAt(0).toLowerCase()}${mix.slice(1)}`;
}

function chaseParagraph(kind: NoteReport["kind"]): string {
  if (kind === "close") {
    return "Holding off tonight is the smart read. Buying more after a surge is how people chase. The move for you is doing nothing.";
  }
  if (kind === "sunday") {
    return "Holding steady through the headlines was the right read. Buying into a spike is how people chase. The plan for next week does not need a rewrite tonight.";
  }
  return "It's tempting to jump in on that move. Buying a gap like this is how people wreck what they paid. The move for you is doing nothing. Let the shares you already have run.";
}

function closeParagraph(kind: NoteReport["kind"]): string {
  if (kind === "morning") {
    return "Nothing you need to do before the open. Enjoy your morning and let it play out.";
  }
  if (kind === "sunday") {
    return "Enjoy the rest of your Sunday. Nothing you need to do tonight.";
  }
  return "Your portfolio did its job today. Nothing you need to change tonight. Log off and let it sit.";
}

function leadParagraph(r: NoteReport): string {
  const gap = r.movers[0];
  const tag = gap ? cashtag(gap.ticker) : null;
  const headline = r.news?.title ? clipHeadline(r.news.title) : null;
  if (r.kind === "morning") {
    if (tag && headline) {
      return `${tag} is moving this morning. ${headline}.`;
    }
    if (tag && gap && Math.abs(gap.pct) >= 0.02) {
      return `${tag} is ${pct(gap.pct)} overnight. That's the name doing the work this morning.`;
    }
    if (tag) return `${tag} is the name to watch this morning.`;
    return r.lead;
  }
  if (r.kind === "sunday") {
    const week =
      r.todayPct != null
        ? `Your portfolio was ${pct(r.todayPct)} this week, ${money(r.todayDollar)}.`
        : `Your portfolio moved ${money(r.todayDollar)} this week.`;
    if (tag && headline) {
      return `${tag} stole the show this week. ${headline}. ${week}`;
    }
    if (tag && gap && gap.pct > 0) {
      return `${tag} stole the show this week, ${pct(gap.pct)}. ${week}`;
    }
    return week;
  }
  if (tag && headline) {
    return `${tag} had the session. ${headline}. That move did most of the day's work in your portfolio.`;
  }
  if (tag) {
    return `${tag} did the work today. Let that sit.`;
  }
  return r.lead;
}

function letter(r: NoteReport): string {
  const parts = [leadParagraph(r)];
  const source = sourceLine(r);
  if (source) parts.push(source);
  parts.push(chaseParagraph(r.kind));
  const mix = mixParagraph(r);
  if (mix) parts.push(mix);
  parts.push(closeParagraph(r.kind));
  return parts.join("\n\n");
}

function fallbackSunday(r: NoteReport): string {
  return letter(r);
}

function fallbackWeekday(r: NoteReport): string {
  return letter(r);
}

/** Deterministic stand-in when the model is down or dumps the prompt. */
export function fallbackNoteTake(r: NoteReport): string {
  if (r.kind === "sunday") {
    return humanizeMargusText(fallbackSunday(r));
  }
  const text = humanizeMargusText(fallbackWeekday(r));
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
  if (r.news) {
    lines.push(
      `Headline for ${cashtag(r.news.ticker)}: ${r.news.title}`,
      `Publisher: ${r.news.publisher}`
    );
  } else {
    lines.push("No headline. Describe the move from the numbers. Skip the source line.");
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

async function attachNews(report: NoteReport): Promise<void> {
  if (report.news) return;
  const lead = report.movers[0]?.ticker ?? report.watches[0]?.ticker;
  if (!lead) return;
  try {
    const items = await fetchTickerNews(lead, 3);
    const top = items.find((n) => n.title.trim());
    if (!top) return;
    report.news = {
      ticker: lead,
      title: top.title.trim(),
      publisher: (top.publisher || "News").trim(),
    };
  } catch {
    // fail open: letter still ships from the numbers
  }
}

export async function writeMargusNoteTake(
  report: NoteReport
): Promise<string | null> {
  await attachNews(report);
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
          maxOutputTokens: 640,
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
