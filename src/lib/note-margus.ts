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
  morning: `This is the morning pre-market note. You/your. Three short sections with a blank line between them. Varied sentence length. Never we/us/our. Never name a website, publisher, or paste a link.

Section 1. The name that's moving overnight. Cashtag. The actual headline if facts give one, or the overnight number if they don't. Then why chasing a gap like this ruins your cost basis. Two or three sentences, one paragraph.
Section 2. The real concentration percent from facts, once. Tie it to this morning. Standing down keeps cash free for the missing group (utilities that sell power, when facts say that's the gap). Fresh wording. Do not paste the insight lines.
Section 3. Sit tight before the bell. Enjoy your morning and let it play out.

Never invent news. Overnight and today's calendar only. Do not recap yesterday's regular session.
Never write "do not buy more", "no trades", "do not add", "sell some".`,
  close: `This is the after-the-close note. You/your. Three short sections with a blank line between them. Never we/us/our. Never name a website, publisher, or paste a link.

Section 1. Session for this portfolio, percent and dollars if facts give them. Who did the work. Cashtag. The actual headline if facts give one. How much that name did versus the rest.
Section 2. Why standing down tonight is the smart play. Buying more after a surge is chasing. Buying falling utilities is catching a falling knife. Name the concentration percent once, tied to today. Do not paste the insight lines.
Section 3. Log off and let it sit.

Never write "do not buy more", "no trades", "do not add", "sell some".`,
  sunday: `This is the Sunday weekly recap. You/your. Three short sections with a blank line between them. The loud-mover numbers are already a table. Do not list those names again. Never we/us/our. Never name a website, publisher, or paste a link.

Section 1. The week's percent and dollar for this portfolio. Who stole the show. Cashtag. The actual headline if facts give one.
Section 2. Concentration versus the missing group for the week. Name the percent once. Fresh wording. Do not paste the insight lines.
Section 3. The plan for next week stays unchanged. Enjoy the rest of your Sunday.

Never invent news. Never write "do not buy more", "no trades", "do not add", "sell some".`,
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
  /Section 1\./i,
  /Section 2\./i,
  /Section 3\./i,
];

export function looksLikePromptLeak(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  return LEAK.some((re) => re.test(s));
}

function clipHeadline(title: string): string {
  const t = title.trim().replace(/[ \t]+/g, " ").replace(/[.,;:]+$/, "");
  if (t.length <= 160) return t;
  const cut = t.slice(0, 157);
  const at = cut.lastIndexOf(" ");
  return at > 80 ? cut.slice(0, at) : cut;
}

function mixBits(r: NoteReport): { pct: string; group: string; power: boolean } | null {
  const mix = r.insights[1] ?? r.insights[0];
  if (!mix) return null;
  const power = /utilit|electric|power/.test(mix);
  const named =
    mix.match(/(\d+%) of (?:this|your|our) portfolio is ([^.]+)/i) ??
    mix.match(/Most of your portfolio is ([^(]+)\s*\((\d+%)\)/i);
  if (named) {
    if (named[1]?.includes("%")) {
      return {
        pct: named[1] ?? "",
        group: (named[2] ?? "one group").trim(),
        power,
      };
    }
    return {
      pct: named[2] ?? "",
      group: (named[1] ?? "one group").trim(),
      power,
    };
  }
  const simple = mix.match(/(\d+%) is ([^.]+)/i);
  if (simple) {
    return {
      pct: simple[1] ?? "",
      group: (simple[2] ?? "one group").trim(),
      power,
    };
  }
  const pctOnly = mix.match(/(\d+%)/);
  if (!pctOnly) return null;
  return { pct: pctOnly[1] ?? "", group: "one group", power };
}

function section1(r: NoteReport): string {
  const gap = r.movers[0];
  const tag = gap ? cashtag(gap.ticker) : null;
  const headline = r.news?.title ? clipHeadline(r.news.title) : null;
  if (r.kind === "morning") {
    let lead: string;
    if (tag && headline) lead = `${tag} is moving this morning. ${headline}.`;
    else if (tag && gap && Math.abs(gap.pct) >= 0.02) {
      lead = `${tag} is ${pct(gap.pct)} overnight. That's the name doing the work this morning.`;
    } else if (tag) lead = `${tag} is the name to watch this morning.`;
    else lead = r.lead;
    return `${lead} Chasing a gap like this ruins your cost basis.`;
  }
  if (r.kind === "sunday") {
    const week =
      r.todayPct != null
        ? `Your portfolio was ${pct(r.todayPct)} this week, ${money(r.todayDollar)}.`
        : `Your portfolio moved ${money(r.todayDollar)} this week.`;
    if (tag && headline) {
      return `${week} ${tag} stole the show this week. ${headline}.`;
    }
    if (tag && gap && gap.pct > 0) {
      return `${week} ${tag} stole the show this week, ${pct(gap.pct)}.`;
    }
    return week;
  }
  const session =
    r.todayPct != null
      ? `Your portfolio was ${pct(r.todayPct)} today, ${money(r.todayDollar)}.`
      : `Your portfolio moved ${money(r.todayDollar)} today.`;
  if (tag && headline) {
    return `${session} ${tag} did the work today. ${headline}.`;
  }
  if (tag) {
    return `${session} ${tag} did the work today.`;
  }
  return r.lead;
}

function section2(r: NoteReport): string {
  const bits = mixBits(r);
  if (r.kind === "morning") {
    if (bits?.power) {
      return `Keeping ${bits.pct} in ${bits.group} means you don't need to chase fresh highs today. Standing down keeps cash free for utilities that sell power when they get cheaper.`;
    }
    if (bits) {
      return `Keeping ${bits.pct} in ${bits.group} means you don't need to chase a new name this morning. Standing down keeps cash free for later.`;
    }
    return "Standing down this morning keeps cash free for later. You don't need to chase a gap.";
  }
  if (r.kind === "close") {
    const knife = bits?.power
      ? " Buying falling utilities tonight is catching a falling knife."
      : "";
    const weight = bits
      ? ` The ${bits.pct} in ${bits.group} is still the bulk of your portfolio.`
      : "";
    return `Standing down tonight is the smart play. Buying more after a surge is chasing.${knife}${weight}`;
  }
  if (bits?.power) {
    return `Your ${bits.pct} in ${bits.group} held through the week. Utilities that sell power barely showed up. That's still the gap.`;
  }
  if (bits) {
    return `Your ${bits.pct} in ${bits.group} is still the week to sit with. The mix did not need a rewrite.`;
  }
  return "The mix did not need a rewrite this week. Hold what you hold.";
}

function section3(kind: NoteReport["kind"]): string {
  if (kind === "morning") {
    return "Sit tight before the bell. Enjoy your morning and let it play out.";
  }
  if (kind === "sunday") {
    return "The plan for next week stays unchanged. Enjoy the rest of your Sunday.";
  }
  return "Log off and let it sit.";
}

function letter(r: NoteReport): string {
  return [section1(r), section2(r), section3(r.kind)].join("\n\n");
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
    lines.push(`Headline for ${cashtag(r.news.ticker)}: ${r.news.title}`);
  } else {
    lines.push("No headline. Describe the move from the numbers.");
  }
  return lines.filter((x): x is string => Boolean(x)).join("\n");
}

function stripCitations(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\[\[source:/i.test(line.trim()))
    .join("\n")
    .replace(/\[\[source:[^\]]*\]\]/gi, "")
    .replace(/https?:\/\/[^\s)]+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function acceptNote(text: string): string | null {
  const lined = stripCitations(
    text
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .split("\n")
      .map((line) => line.replace(/[ \t]{2,}/g, " ").trimEnd())
      .join("\n")
      .trim()
  );
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
