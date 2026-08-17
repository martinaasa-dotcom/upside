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
  morning: `This is the morning note. You/your. Two short paragraphs, one blank line between them. Kitchen-table words. Finish every sentence. Never we/us/our. Never name a website or paste a link.

Open with the names that moved overnight, cashtags, and why when facts give a headline. More than one name is fine. Then name the biggest holdings from facts and say each was steady, up, or down, with the percent. Do not paste a headline as its own sentence.
Then: there is nothing to buy or sell. Sit back, hold, and let the money work in the background.

Never invent news. Never name how much of the portfolio sits in one group. Overnight only.`,
  close: `This is the after-the-close note. You/your. Two short paragraphs, one blank line between them. Kitchen-table words. Finish every sentence. Never we/us/our. Never name a website or paste a link.

Open with how the day ended, percent and dollars. Name the names that did the work, more than one if facts show more than one. Then name the biggest holdings from facts and say each was steady, up, or down, with the percent.
Then: no reason to make any moves tonight. Enjoy the evening, and let the investments keep compounding.

Never invent news. Never name how much of the portfolio sits in one group.`,
  sunday: `This is the Sunday weekly recap. You/your. Two short paragraphs, one blank line between them. Kitchen-table words. Finish every sentence. Never we/us/our. Never name a website or paste a link.

Open with the week's percent and dollar. Name who led, more than one name if facts show more than one. Then name the biggest holdings from facts and say each was steady, up, or down, with the percent.
Then: everything is on track, no changes needed for the week ahead, enjoy the rest of the weekend.

Never invent news. Never name how much of the portfolio sits in one group.`,
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

function whyMoved(headline: string | null): string | null {
  if (!headline) return null;
  const h = clipHeadline(headline);
  if (/join|added|includ/i.test(h) && /S\s*&\s*P\s*500/i.test(h)) {
    return "it was added to the S&P 500";
  }
  if (/join|added|includ/i.test(h) && /S\s*&\s*P|Russell|Nasdaq-100/i.test(h)) {
    return "it was added to a big index";
  }
  if (/earn/i.test(h)) return "the company reported its results";
  return null;
}

function indexExplain(headline: string | null): string | null {
  if (!headline) return null;
  if (!/join|added|includ/i.test(headline)) return null;
  if (!/S\s*&\s*P|Russell|Nasdaq-100|index/i.test(headline)) return null;
  return "When a stock joins this list, big index funds have to buy it automatically, which pushes the price up before regular trading even opens.";
}

function unsignedPct(n: number): string {
  return `${(Math.abs(n) * 100).toFixed(1)}%`;
}

function jumpedOrDropped(n: number): string {
  if (n > 0) return "jumped";
  if (n < 0) return "dropped";
  return "moved";
}

function dayResult(pctMove: number | null, dollar: number): string {
  if (pctMove == null) return `moved ${money(dollar)}`;
  if (pctMove > 0) return `up ${unsignedPct(pctMove)} (${money(dollar)})`;
  if (pctMove < 0) return `down ${unsignedPct(pctMove)} (${money(dollar)})`;
  return `flat (${money(dollar)})`;
}

function holdingPct(r: NoteReport, ticker: string): number | undefined {
  return r.movers.find((m) => m.ticker === ticker)?.pct;
}

function holdingCheck(ticker: string, pct: number | undefined): string {
  const tag = cashtag(ticker);
  if (pct == null || Math.abs(pct) < 0.005) return `${tag} was steady`;
  if (pct > 0) return `${tag} was up ${unsignedPct(pct)}`;
  return `${tag} was down ${unsignedPct(pct)}`;
}

function joinChecks(bits: string[]): string {
  if (bits.length === 0) return "";
  if (bits.length === 1) return bits[0] ?? "";
  if (bits.length === 2) return `${bits[0]}, and ${bits[1]}`;
  return `${bits.slice(0, -1).join(", ")}, and ${bits[bits.length - 1]}`;
}

function biggestLine(r: NoteReport): string {
  const top = r.weights.slice(0, 4);
  const bits = top.map((w) => holdingCheck(w.ticker, holdingPct(r, w.ticker)));
  const joined = joinChecks(bits);
  if (!joined) return "";
  return `Among your biggest holdings, ${joined}.`;
}

function letter(r: NoteReport): string {
  const mover = r.movers[0];
  const tag = mover ? cashtag(mover.ticker) : null;
  const headline = r.news?.title ? clipHeadline(r.news.title) : null;
  const why = whyMoved(headline);
  const indexHow = indexExplain(headline);
  const biggest = biggestLine(r);

  if (r.kind === "morning") {
    let first: string;
    if (tag && why && indexHow) {
      first = `${tag} jumped this morning because ${why}. ${indexHow}`;
    } else if (tag && why) {
      first = `${tag} ${jumpedOrDropped(mover?.pct ?? 0)} this morning because ${why}.`;
    } else if (tag && mover && Math.abs(mover.pct) >= 0.02) {
      first = `${tag} ${jumpedOrDropped(mover.pct)} ${unsignedPct(mover.pct)} this morning.`;
    } else if (tag) {
      first = `${tag} is the name that moved this morning.`;
    } else {
      first = r.lead;
    }
    if (biggest) first = `${first} ${biggest}`;
    const second =
      "There is nothing you need to buy or sell. The best thing to do right now is sit back, hold, and let your money do its work in the background.";
    return `${first}\n\n${second}`;
  }

  if (r.kind === "close") {
    const result = dayResult(r.todayPct, r.todayDollar);
    let first = `Your portfolio ended the day ${result}.`;
    if (tag && mover) {
      first = `${first} ${cashtag(mover.ticker)} ${mover.pct < 0 ? "fell" : "climbed"}, ${mover.pct < 0 ? "down" : "up"} ${unsignedPct(mover.pct)}.`;
    }
    if (biggest) first = `${first} ${biggest}`;
    const second =
      "There is no reason to make any moves tonight. Enjoy your evening, and let your investments keep compounding.";
    return `${first}\n\n${second}`;
  }

  let first: string;
  if (r.todayPct != null && r.todayPct >= 0) {
    first = `Your portfolio gained ${unsignedPct(r.todayPct)} this week (${money(r.todayDollar)}).`;
  } else {
    first = `Your portfolio was ${dayResult(r.todayPct, r.todayDollar)} this week.`;
  }
  if (tag && mover && mover.pct > 0) {
    first = `${first} ${tag} led, up ${unsignedPct(mover.pct)}.`;
  } else if (tag && mover && mover.pct < 0) {
    first = `${first} ${tag} led, down ${unsignedPct(mover.pct)}.`;
  }
  if (biggest) first = `${first} ${biggest}`;
  const second =
    "Everything is on track, so there are no changes needed for the week ahead. Enjoy the rest of your weekend.";
  return `${first}\n\n${second}`;
}

function fallbackSunday(r: NoteReport): string {
  return letter(r);
}

function fallbackWeekday(r: NoteReport): string {
  return letter(r);
}

function plainNote(text: string): string {
  let s = text;
  s = s.replace(/\bcost basis\b/gi, "what you paid");
  s = s.replace(/\bfalling knife\b/gi, "buying something that is still dropping");
  s = s.replace(/\bcatalysts?\b/gi, "news");
  s = s.replace(/\bpre-bell\b/gi, "before the market opens");
  s = s.replace(/\bread on the business\b/gi, "new information about the company");
  s = s.replace(/\bstructural opening\b/gi, "something to look at later");
  s = s.replace(/\bchasing\b/gi, "buying after a jump");
  s = s.replace(/\bgaps?\b/gi, "jump");
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/^[ \t]+|[ \t]+$/gm, "");
  return s.trim();
}

function finishNote(text: string): string {
  return plainNote(humanizeMargusText(text));
}

/** Deterministic stand-in when the model is down or dumps the prompt. */
export function fallbackNoteTake(r: NoteReport): string {
  if (r.kind === "sunday") {
    return finishNote(fallbackSunday(r));
  }
  const text = finishNote(fallbackWeekday(r));
  if (text.length >= 20 && !looksLikePromptLeak(text)) return text;
  return finishNote(r.lead);
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

function facts(r: NoteReport): string {
  const lines = [
    `Kind: ${r.kind}`,
    `Lead: ${r.lead}`,
    `Portfolio: $${Math.round(r.book).toLocaleString("en-US")} across ${r.nameCount} names`,
    `${r.todayLabel}: ${money(r.todayDollar)}${r.todayPct != null ? ` (${(r.todayPct * 100).toFixed(1)}%)` : ""}`,
  ];
  const loud = r.loudMovers.length > 0 ? r.loudMovers : r.movers;
  if (loud[0]) {
    lines.push(
      "Names that moved:",
      ...loud.map(
        (m) =>
          `  ${cashtag(m.ticker)} ${m.pct >= 0 ? "+" : "-"}${(Math.abs(m.pct) * 100).toFixed(1)}% ${money(m.dollar)} at $${m.price.toFixed(2)}`
      )
    );
  }
  if (r.weights[0]) {
    lines.push(
      "Biggest holdings (name each one: steady, or up/down with the percent):",
      ...r.weights.slice(0, 4).map((w) => {
        const m = r.movers.find((row) => row.ticker === w.ticker);
        const move =
          m && Math.abs(m.pct) >= 0.005
            ? `${m.pct >= 0 ? "+" : "-"}${(Math.abs(m.pct) * 100).toFixed(1)}%`
            : "steady";
        return `  ${cashtag(w.ticker)} ${move}`;
      })
    );
  }
  if (r.news) {
    lines.push(`Headline for ${cashtag(r.news.ticker)}: ${r.news.title}`);
    lines.push("Turn that headline into a because-clause. Do not paste it as its own sentence.");
  } else {
    lines.push("No headline. Describe the move from the numbers only.");
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

function stillJargon(text: string): boolean {
  return /cost basis|falling knife|\bcatalyst\b|pre-bell|read on the business|structural|\bgap\b|\d+%\s+of\s+(?:this|your|our)\s+portfolio/i.test(
    text
  );
}

function looksTruncated(text: string): boolean {
  return !/[.!?]"?'?$/.test(text.trim());
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
  const clean = finishNote(lined);
  if (clean.length < 40) return null;
  if (looksLikePromptLeak(clean)) return null;
  if (stillJargon(clean)) return null;
  if (looksTruncated(clean)) return null;
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
