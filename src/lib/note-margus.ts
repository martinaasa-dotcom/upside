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
  morning: `This is the morning pre-market note. You/your. One connected letter in two paragraphs with a blank line between them. Full sentences with transitions. Never a stack of one-line blocks. Never we/us/our. Never name a website, publisher, or paste a link.

First paragraph: overnight catalyst, cashtag, the actual headline if facts give one, or the overnight number if they don't. Immediately say the mechanic when the headline supports it (index inclusion means funds that track the benchmark have to buy; earnings means the number is still being digested). Then why chasing pre-bell volume on that gap ruins cost basis. Let the shares you already have run.
Second paragraph: the real concentration percent from facts, once, tied to today's gap. Standing down keeps cash free for the missing group (utilities that sell power, when facts say that's the gap). Close on a directive for the opening bell.

Never invent news or a mechanic the facts do not support. Overnight and today's calendar only. Do not recap yesterday's regular session.
Never write "do not buy more", "no trades", "do not add", "sell some". Do not paste the insight lines.`,
  close: `This is the after-the-close note. You/your. One connected letter in two paragraphs with a blank line between them. Full sentences with transitions. Never a stack of one-line blocks. Never we/us/our. Never name a website, publisher, or paste a link.

First paragraph: session for this portfolio, percent and dollars. Who did the work versus the rest. Cashtag. The actual headline if facts give one, and the mechanic when facts support it. Then why standing down tonight is the discipline: buying more after a surge is chasing, buying a falling group is a falling knife.
Second paragraph: re-anchor the long-term mix. The real concentration percent from facts, once, tied to today. Log off and let the position sit.

Never write "do not buy more", "no trades", "do not add", "sell some". Do not paste the insight lines.`,
  sunday: `This is the Sunday weekly recap. You/your. One connected letter in two paragraphs with a blank line between them. The loud-mover numbers are already a table. Do not list those names again. Full sentences with transitions. Never we/us/our. Never name a website, publisher, or paste a link.

First paragraph: the week's percent and dollar. Who led, cashtag, the actual headline if facts give one. Frame the split between groups as the mix you already chose, not a problem to patch this weekend.
Second paragraph: concentration versus the missing group. Name the percent once. The plan for next week stays unchanged.

Never invent news. Never write "do not buy more", "no trades", "do not add", "sell some". Do not paste the insight lines.`,
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
  /Narrative Arc/i,
  /Institutional Portfolio/i,
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

function mechanicFor(headline: string | null): string | null {
  if (!headline) return null;
  if (/S\s*&\s*P|S and P|Russell|Nasdaq-100|index inclusion|to join the/i.test(headline)) {
    return "Funds that track that benchmark have to buy, which is why the gap is there before anyone has a new read on the business.";
  }
  if (/earn/i.test(headline)) {
    return "That earnings number is still being digested, which is why the price is moving faster than the story.";
  }
  return null;
}

function letter(r: NoteReport): string {
  const gap = r.movers[0];
  const tag = gap ? cashtag(gap.ticker) : null;
  const headline = r.news?.title ? clipHeadline(r.news.title) : null;
  const mechanic = mechanicFor(headline);
  const bits = mixBits(r);

  if (r.kind === "morning") {
    let catalyst: string;
    if (tag && headline) {
      catalyst = `${tag} is moving this morning. ${headline}.`;
      if (mechanic) catalyst = `${catalyst} ${mechanic}`;
    } else if (tag && gap && Math.abs(gap.pct) >= 0.02) {
      catalyst = `${tag} is ${pct(gap.pct)} overnight, and that is the name doing the work this morning.`;
    } else if (tag) {
      catalyst = `${tag} is the name to watch this morning.`;
    } else {
      catalyst = r.lead;
    }
    const first = `${catalyst} Chasing pre-bell volume on a gap like this ruins your cost basis, so the discipline is to let the shares you already have run.`;
    let second: string;
    if (bits?.power) {
      second = `Your portfolio is still ${bits.pct} in ${bits.group}, which is why you do not need to spend cash on a name that already ran. Standing down keeps that cash free for utilities that sell power when they get cheaper, and that is the gap next to this mix. Sit tight into the opening bell and let the shares run.`;
    } else if (bits) {
      second = `Your portfolio is still ${bits.pct} in ${bits.group}, which is why you do not need to chase a new name this morning. Standing down keeps cash free for later. Sit tight into the opening bell and let the shares run.`;
    } else {
      second =
        "Standing down this morning keeps cash free for later. Sit tight into the opening bell and let the shares run.";
    }
    return `${first}\n\n${second}`;
  }

  if (r.kind === "close") {
    const session =
      r.todayPct != null
        ? `Your portfolio was ${pct(r.todayPct)} today, ${money(r.todayDollar)}`
        : `Your portfolio moved ${money(r.todayDollar)} today`;
    let first: string;
    if (tag && headline) {
      first = `${session}, and ${tag} did the work today. ${headline}.`;
      if (mechanic) first = `${first} ${mechanic}`;
      first = `${first} The rest of the names lagged that move.`;
    } else if (tag) {
      first = `${session}, and ${tag} did the work today while the rest of the names lagged.`;
    } else {
      first = `${session}.`;
    }
    first = `${first} Buying more after a surge is chasing, and buying a falling group tonight is catching a falling knife, so standing down keeps you from trading the close on a feeling.`;
    const mix = bits
      ? `The ${bits.pct} in ${bits.group} is still the long-term mix${
          bits.power
            ? ", and utilities that sell power remain the gap next to it"
            : ""
        }.`
      : "The mix you already chose is still the long-term mix.";
    return `${first}\n\n${mix} Log off and let the position sit.`;
  }

  const week =
    r.todayPct != null
      ? `Your portfolio was ${pct(r.todayPct)} this week, ${money(r.todayDollar)}`
      : `Your portfolio moved ${money(r.todayDollar)} this week`;
  let first: string;
  if (tag && headline) {
    first = `${week}, and ${tag} stole the show this week. ${headline}.`;
  } else if (tag && gap && gap.pct > 0) {
    first = `${week}, and ${tag} stole the show this week at ${pct(gap.pct)}.`;
  } else {
    first = `${week}.`;
  }
  first = `${first} The split between that run and the quieter names is the mix you already chose, not a problem to patch this weekend.`;
  const mix = bits?.power
    ? `Your ${bits.pct} in ${bits.group} held, and utilities that sell power barely showed up. That gap is structural, which is why it is still an opening later, not a rewrite tonight.`
    : bits
      ? `Your ${bits.pct} in ${bits.group} is still the week to sit with.`
      : "The mix did not need a rewrite this week.";
  return `${first}\n\n${mix} The plan for next week stays unchanged.`;
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
          maxOutputTokens: 720,
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
