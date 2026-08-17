/** Daily / close / Sunday note as a real report. HTML + plain text. */

import { cashtag } from "@/lib/format";
import { stripAiDashes } from "@/lib/ai/humanize-copy";
import { statusLabel } from "@/lib/thesis-pulse";
import { buildBookInsights } from "@/lib/book-insights";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import {
  EMAIL,
  emailAccountFooter,
  emailButton,
  emailCard,
  emailKicker,
  emailSection,
  escapeEmail,
  wrapEmailLetter,
} from "@/lib/email-letter";
import { todayDollarFor } from "@/lib/overview";
import type { ConvictionMap } from "@/lib/conviction";
import type { EarningsEvent, WeekReturn } from "@/lib/market/yahoo";
import type { Quote } from "@/lib/types";

export type NoteKind = "morning" | "close" | "sunday";

type HoldingRow = {
  ticker: string;
  shares: number;
  buy_price: number;
};

export type NoteReportInput = {
  kind: NoteKind;
  name: string | null;
  cash: number;
  holdings: HoldingRow[];
  quotes: Record<string, Quote>;
  conviction?: ConvictionMap;
  weekReturns?: Record<string, WeekReturn>;
  earnings?: EarningsEvent[];
  now?: Date;
};

export type NoteMover = {
  ticker: string;
  price: number;
  pct: number;
  dollar: number;
};

export type NoteWeight = {
  ticker: string;
  weight: number;
};

export type NoteThesis = {
  ticker: string;
  shares: number;
  price: number;
  value: number;
  weight: number | null;
  todayDollar: number;
  todayPct: number | null;
  ownerThesis: string | null;
  pulseLine: string | null;
  status: string | null;
};

export type NoteWeekNote = {
  ticker: string;
  status: string | null;
  ownerThesis: string | null;
  pulseLine: string | null;
  actionLine: string;
};

export type NoteWatch = {
  ticker: string | null;
  line: string;
};

export type NoteReport = {
  kind: NoteKind;
  title: string;
  dateLine: string;
  shortDate: string;
  book: number;
  nameCount: number;
  todayLabel: string;
  todayDollar: number;
  todayPct: number | null;
  quiet: boolean;
  lead: string;
  subjectHook: string;
  moversHeading: string;
  movers: NoteMover[];
  loudMovers: NoteMover[];
  weights: NoteWeight[];
  watches: NoteWatch[];
  perspective: string[];
  thesis: NoteThesis | null;
  weekNotes: NoteWeekNote[];
  margus: string | null;
  insights: string[];
};

const TITLE: Record<NoteKind, string> = {
  morning: "Before the open",
  close: "After the close",
  sunday: "The week",
};

function groupUs(n: number): string {
  const neg = n < 0;
  const grouped = String(Math.round(Math.abs(n))).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ","
  );
  return `${neg ? "-" : ""}${grouped}`;
}

function money(n: number): string {
  return `$${groupUs(n)}`;
}

function priceMoney(n: number): string {
  const neg = n < 0;
  const [whole, frac] = Math.abs(n).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}$${grouped}.${frac}`;
}

function clipPreview(text: string, max = 88): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > 40 ? cut.slice(0, at) : cut).replace(/[.,;:]+$/, "")}.`;
}

/** Calendar leftovers for the morning email. The letter already covers the
 * headline name, so this is only reports that are not that story. */
export function leftoverWatches(r: NoteReport): NoteWatch[] {
  if (r.kind !== "morning") return [];
  const lead = r.lead.trim();
  const work = r.movers[0]?.ticker?.toUpperCase() ?? "";
  return r.watches.filter((w) => {
    if (!/reports /i.test(w.line)) return false;
    if (w.line === lead) return false;
    const t = (w.ticker ?? "").toUpperCase();
    if (t && work && t === work) return false;
    const tag = t ? cashtag(t) : "";
    if (tag && lead.startsWith(tag)) return false;
    if (t && lead.startsWith(t)) return false;
    return true;
  });
}

/** First line on a lock screen or watch. Complements the subject. Never
 * repeats the dollar, the percent, or the date. */
export function notePreview(r: NoteReport): string {
  if (r.kind === "morning") {
    const extra = leftoverWatches(r)[0];
    if (extra?.line) return clipPreview(extra.line);
    return "Nothing else you have to do before the open.";
  }

  const earn = r.watches.find((w) => /reports/i.test(w.line));
  const best = [...r.movers].sort((a, b) => b.pct - a.pct)[0];
  const worst = [...r.movers].sort((a, b) => a.pct - b.pct)[0];
  const bits: string[] = [];
  if (best && best.pct > 0) {
    bits.push(`${cashtag(best.ticker)} was the gainer.`);
  } else if (worst && worst.pct < 0) {
    bits.push(`${cashtag(worst.ticker)} was the drop.`);
  } else if (r.movers[0]) {
    bits.push(`${cashtag(r.movers[0].ticker)} moved the most.`);
  }
  if (r.kind === "sunday" && earn?.line) bits.push(earn.line);
  if (bits.length === 0) {
    return r.kind === "sunday" ? "A quiet week." : "A quiet day.";
  }
  return clipPreview(bits.join(" "));
}

function signedMoney(n: number): string {
  const abs = money(Math.abs(n));
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

function signedPct(pct: number): string {
  const n = `${(Math.abs(pct) * 100).toFixed(1)}%`;
  if (pct > 0) return `+${n}`;
  if (pct < 0) return `-${n}`;
  return n;
}

function weightPct(weight: number): string {
  return `${Math.round(Math.abs(weight) * 100)}%`;
}

/** Names that moved enough to earn a mention. Quiet weeks still get the
 * three loudest so the note has something specific to say. */
export function loudNoteMoves(
  movers: NoteMover[],
  book: number
): NoteMover[] {
  const dollarFloor = Math.max(1000, Math.abs(book) * 0.004);
  const hits = movers.filter(
    (m) => Math.abs(m.pct) >= 0.04 || Math.abs(m.dollar) >= dollarFloor
  );
  const picked = (hits.length > 0 ? hits : movers.slice(0, 3)).slice(0, 12);
  return [...picked].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
}

const escapeHtml = escapeEmail;

function dateLine(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Tallinn",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
}

function clipThesis(raw: string): string | null {
  const clean = stripAiDashes(raw.replace(/\s+/g, " ").trim());
  if (!clean) return null;
  if (clean.length <= 220) return clean;
  const cut = clean.slice(0, 217);
  const at = cut.lastIndexOf(" ");
  return `${cut.slice(0, at > 140 ? at : 217).trim()}...`;
}

type Position = {
  ticker: string;
  shares: number;
  price: number;
  value: number;
  pct: number | null;
  dollar: number;
};

/** After-hours or pre-market vs the regular close. Not the regular session. */
function extendedPct(q: Quote | undefined): number | null {
  if (!q) return null;
  if (
    q.preMarketChangePercent != null &&
    Number.isFinite(q.preMarketChangePercent)
  ) {
    return q.preMarketChangePercent;
  }
  if (
    q.postMarketChangePercent != null &&
    Number.isFinite(q.postMarketChangePercent)
  ) {
    return q.postMarketChangePercent;
  }
  return null;
}

function sessionMoves(input: NoteReportInput) {
  const useWeek = input.kind === "sunday";
  let equity = 0;
  let today = 0;
  const byTicker = new Map<string, Position>();
  for (const h of input.holdings) {
    const ticker = h.ticker.toUpperCase();
    if (!ticker) continue;
    const q = input.quotes[ticker];
    const price = q?.price ?? h.buy_price;
    const value = h.shares * price;
    const week = input.weekReturns?.[ticker];
    const move = useWeek
      ? week
        ? {
            dollar: h.shares * (price - week.start),
            pct: week.pct,
          }
        : { dollar: 0, pct: null }
      : todayDollarFor(value, q?.changePercent);
    equity += value;
    today += move.dollar;
    const prev = byTicker.get(ticker);
    if (prev) {
      prev.shares += h.shares;
      prev.value += value;
      prev.dollar += move.dollar;
      prev.price = price;
      prev.pct = move.pct ?? prev.pct;
    } else {
      byTicker.set(ticker, {
        ticker,
        shares: h.shares,
        price,
        value,
        pct: move.pct,
        dollar: move.dollar,
      });
    }
  }
  const book = equity + input.cash;
  const prevBook = book - today;
  const positions = [...byTicker.values()];
  const movers: NoteMover[] = positions
    .filter((p) => p.pct != null)
    .map((p) => ({
      ticker: p.ticker,
      price: p.price,
      pct: p.pct as number,
      dollar: p.dollar,
    }))
    .sort((a, b) => Math.abs(b.dollar) - Math.abs(a.dollar));
  const weights: NoteWeight[] = [...positions]
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((p) => ({
      ticker: p.ticker,
      weight: book !== 0 ? p.value / book : 0,
    }));
  const overnight: NoteMover[] = positions
    .map((p) => {
      const q = input.quotes[p.ticker];
      const pct = extendedPct(q);
      if (pct == null) return null;
      const dollar = p.shares * p.price * pct;
      return { ticker: p.ticker, price: p.price, pct, dollar };
    })
    .filter((m): m is NoteMover => {
      if (!m) return false;
      return Math.abs(m.pct) >= 0.01 || Math.abs(m.dollar) >= 25;
    })
    .sort((a, b) => Math.abs(b.dollar) - Math.abs(a.dollar));
  return {
    book,
    today,
    todayPct: prevBook !== 0 ? today / prevBook : null,
    movers,
    overnight,
    weights,
    positions,
    nameCount: positions.length,
    quiet: Math.abs(today) < Math.max(50, Math.abs(book) * 0.005),
  };
}

function thesisFor(
  pos: Position,
  book: number,
  conviction: ConvictionMap | undefined
): NoteThesis {
  const entry = conviction?.[pos.ticker] ?? conviction?.[pos.ticker.toUpperCase()];
  const ownerThesis = entry?.thesis ? clipThesis(entry.thesis) : null;
  const stamp = entry?.stamps?.[0];
  const verdict = stamp?.verdict ? stripAiDashes(stamp.verdict).trim() : "";
  const isStatus =
    /^(thesis intact|watch|thesis at risk|intact|broken|reason still holds|reason looks shaky|keep an eye on it)$/i.test(
      verdict
    );
  const fromLine = stamp?.line ? clipThesis(stamp.line) : null;
  const pulseLine =
    fromLine && fromLine.toLowerCase() !== verdict.toLowerCase()
      ? fromLine
      : !isStatus && verdict
        ? clipThesis(verdict)
        : fromLine;
  return {
    ticker: pos.ticker,
    shares: pos.shares,
    price: pos.price,
    value: pos.value,
    weight: book !== 0 ? pos.value / book : null,
    todayDollar: pos.dollar,
    todayPct: pos.pct,
    ownerThesis,
    pulseLine,
    status: isStatus ? humanPulseStatus(verdict) : null,
  };
}

function humanPulseStatus(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("risk") || s.includes("broken") || s.includes("shaky")) {
    return statusLabel("broken");
  }
  if (s.includes("watch") || s.includes("eye")) return statusLabel("watch");
  return statusLabel("intact");
}

export function parseConviction(raw: unknown): ConvictionMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ConvictionMap;
}

function weekActionLine(input: {
  status: string | null;
  action: string | null;
  weekPct: number | null;
}): string | null {
  const status = (input.status ?? "").toLowerCase();
  const action = (input.action ?? "").toLowerCase();
  const intact = status.includes("intact") || status.includes("still holds");
  const watch = status.includes("watch") || status.includes("eye");
  const risk =
    status.includes("risk") ||
    status.includes("broken") ||
    status.includes("shaky");
  const down = input.weekPct != null && input.weekPct <= -0.03;
  const upHot = input.weekPct != null && input.weekPct >= 0.08;

  if (risk || action === "sell") {
    return "Thesis broken. Adding here would make a broken story bigger.";
  }
  if (action === "trim") {
    return "Thesis intact. If it ran too far, selling some is one way to take heat off. Sitting still is fine too.";
  }
  if (watch || action === "watch") return "Wait. Best thing this week is to wait.";
  if (action === "add" || (intact && down)) {
    return "Thesis intact. A dip this week is where people who still believe the reason sometimes add.";
  }
  if (intact && upHot) {
    return "Thesis intact. If it ran too far, selling some is one way to take heat off. Sitting still is fine too.";
  }
  if (intact || action === "hold") {
    return "Thesis intact. Best thing this week is nothing.";
  }
  return null;
}

function weekNotesFor(
  positions: Position[],
  conviction: ConvictionMap | undefined
): NoteWeekNote[] {
  const notes: NoteWeekNote[] = [];
  for (const pos of positions) {
    const thesis = thesisFor(pos, pos.value, conviction);
    const entry = conviction?.[pos.ticker] ?? conviction?.[pos.ticker.toUpperCase()];
    const stamp = entry?.stamps?.[0];
    const action = stamp?.action ?? null;
    const actionLine = weekActionLine({
      status: thesis.status,
      action,
      weekPct: pos.pct,
    });
    if (!actionLine && !thesis.ownerThesis && !thesis.pulseLine) continue;
    notes.push({
      ticker: pos.ticker,
      status: thesis.status,
      ownerThesis: thesis.ownerThesis,
      pulseLine: thesis.pulseLine,
      actionLine: actionLine ?? "",
    });
  }
  notes.sort((a, b) => {
    const pa = positions.find((p) => p.ticker === a.ticker);
    const pb = positions.find((p) => p.ticker === b.ticker);
    return Math.abs(pb?.dollar ?? 0) - Math.abs(pa?.dollar ?? 0);
  });
  return notes
    .filter((n) => n.actionLine.trim().length > 0)
    .slice(0, 3);
}

function earningsLine(days: number, ticker: string): string {
  const name = cashtag(ticker);
  if (days === 0) return `${name} reports today. Expect a bigger swing than usual.`;
  if (days === 1) return `${name} reports tomorrow.`;
  return `${name} reports in ${days} days.`;
}

function dayActionLine(input: {
  status: string | null;
  action: string | null;
  overnightPct: number | null;
}): string | null {
  const status = (input.status ?? "").toLowerCase();
  const action = (input.action ?? "").toLowerCase();
  const intact = status.includes("intact") || status.includes("still holds");
  const watch = status.includes("watch") || status.includes("eye");
  const risk =
    status.includes("risk") ||
    status.includes("broken") ||
    status.includes("shaky");
  const down = input.overnightPct != null && input.overnightPct <= -0.02;

  if (risk || action === "sell") {
    return "Thesis broken. Adding today would make a broken story bigger.";
  }
  if (action === "trim") {
    return "If it runs, selling some is one way not to chase.";
  }
  if (watch || action === "watch") return "Wait. Best thing today is to wait.";
  if (action === "add" || (intact && down)) {
    return "Thesis intact. A dip is where people who still believe the reason sometimes add.";
  }
  return null;
}

function watchesFor(input: {
  kind: NoteKind;
  positions: Position[];
  overnight: NoteMover[];
  earnings: EarningsEvent[];
  conviction: ConvictionMap | undefined;
}): NoteWatch[] {
  const horizon = input.kind === "sunday" ? 14 : 5;
  const out: NoteWatch[] = [];
  const seen = new Set<string>();

  const push = (ticker: string | null, line: string) => {
    const key = `${ticker ?? ""}:${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ticker, line });
  };

  for (const e of input.earnings) {
    if (e.days < 0 || e.days > horizon) continue;
    push(e.ticker, earningsLine(e.days, e.ticker));
  }

  for (const pos of input.positions) {
    const thesis = thesisFor(pos, pos.value, input.conviction);
    const entry =
      input.conviction?.[pos.ticker] ??
      input.conviction?.[pos.ticker.toUpperCase()];
    const stamp = entry?.stamps?.[0];
    const overnight = input.overnight.find((m) => m.ticker === pos.ticker);
    const line =
      input.kind === "sunday"
        ? weekActionLine({
            status: thesis.status,
            action: stamp?.action ?? null,
            weekPct: pos.pct,
          })
        : dayActionLine({
            status: thesis.status,
            action: stamp?.action ?? null,
            overnightPct: overnight?.pct ?? null,
          });
    if (line) push(pos.ticker, `${cashtag(pos.ticker)}. ${line}`);
  }

  return out.slice(0, 4);
}

function perspectiveFor(input: {
  weights: NoteWeight[];
  movers: NoteMover[];
  earnings: EarningsEvent[];
}): string[] {
  const lines: string[] = [];
  const top = input.weights[0];
  if (top && top.weight >= 0.35) {
    lines.push(
      `${cashtag(top.ticker)} is ${weightPct(top.weight)} of your portfolio. The next couple of weeks mostly ride on it.`
    );
  }
  const upcoming = input.earnings.filter((e) => e.days >= 0 && e.days <= 14);
  if (upcoming.length >= 2) {
    const names = upcoming
      .slice(0, 3)
      .map((e) => cashtag(e.ticker))
      .join(", ");
    lines.push(`Reports in the next two weeks: ${names}.`);
  } else if (upcoming.length === 1) {
    const e = upcoming[0]!;
    lines.push(
      `${cashtag(e.ticker)} reports in ${e.days === 0 ? "a few hours" : e.days === 1 ? "a day" : `${e.days} days`}. That's the dated thing on the calendar.`
    );
  }
  const worst = [...input.movers].sort((a, b) => a.pct - b.pct)[0];
  if (worst && worst.pct <= -0.05) {
    lines.push(
      `${cashtag(worst.ticker)} had the rough week. If the thesis is still true, that's a dip, not a new story.`
    );
  }
  if (lines.length === 0) {
    lines.push(
      "Nothing in the next couple of weeks looks like it needs a new plan. Keep doing what you were doing."
    );
  }
  return lines.slice(0, 3);
}

function morningLead(input: {
  overnight: NoteMover[];
  watches: NoteWatch[];
}): { lead: string; subjectHook: string } {
  const earn = input.watches.find((w) => /reports today/i.test(w.line));
  if (earn?.ticker) {
    return {
      lead: `${cashtag(earn.ticker)} reports today. That's the thing to watch.`,
      subjectHook: `${cashtag(earn.ticker)} reports today`,
    };
  }
  const gap = input.overnight[0];
  if (gap && Math.abs(gap.pct) >= 0.02) {
    return {
      lead: `${cashtag(gap.ticker)} is ${signedPct(gap.pct)} overnight. See if that holds into the open.`,
      subjectHook: `${cashtag(gap.ticker)} ${signedPct(gap.pct)} overnight`,
    };
  }
  const add = input.watches.find((w) => /sometimes add/i.test(w.line));
  if (add?.ticker) {
    return {
      lead: `${cashtag(add.ticker)}. Thesis intact. A dip is where people who still believe the reason sometimes add.`,
      subjectHook: `Dip check on ${cashtag(add.ticker)}`,
    };
  }
  if (input.watches[0]) {
    return {
      lead: input.watches[0].line,
      subjectHook: input.watches[0].ticker
        ? `Watch ${cashtag(input.watches[0].ticker)}`
        : "What to watch",
    };
  }
  return {
    lead: "Quiet overnight. Nothing you have to do before the open.",
    subjectHook: "Quiet overnight",
  };
}

function closeLead(input: {
  today: number;
  todayPct: number | null;
  movers: NoteMover[];
  quiet: boolean;
}): { lead: string; subjectHook: string } {
  const hook = signedMoney(input.today);
  if (input.quiet) {
    return {
      lead: "Quiet day. Your portfolio barely moved.",
      subjectHook: hook,
    };
  }
  const top = input.movers[0];
  return {
    lead: top
      ? `${signedMoney(input.today)} on your portfolio. ${cashtag(top.ticker)} moved the most.`
      : `${signedMoney(input.today)} on your portfolio.`,
    subjectHook: hook,
  };
}

function sundayLead(input: {
  today: number;
  todayPct: number | null;
  movers: NoteMover[];
}): { lead: string; subjectHook: string } {
  const hook = signedMoney(input.today);
  const best = [...input.movers].sort((a, b) => b.pct - a.pct)[0];
  const worst = [...input.movers].sort((a, b) => a.pct - b.pct)[0];
  const bits: string[] = [];
  if (best && best.pct > 0) {
    bits.push(`${cashtag(best.ticker)} was the gainer.`);
  }
  if (worst && worst.ticker !== best?.ticker && worst.pct < 0) {
    bits.push(`${cashtag(worst.ticker)} was the drop.`);
  }
  return {
    lead: bits.join(" ") || "A quiet week.",
    subjectHook: hook,
  };
}

export function buildNoteReport(input: NoteReportInput): NoteReport {
  const now = input.now ?? new Date();
  const t = sessionMoves(input);
  const earnings = input.earnings ?? [];
  const watches = watchesFor({
    kind: input.kind,
    positions: t.positions,
    overnight: t.overnight,
    earnings,
    conviction: input.conviction,
  });
  const movers =
    input.kind === "morning" ? t.overnight.slice(0, 5) : t.movers.slice(0, 5);
  const copy =
    input.kind === "morning"
      ? morningLead({ overnight: t.overnight, watches })
      : input.kind === "sunday"
        ? sundayLead({
            today: t.today,
            todayPct: t.todayPct,
            movers: t.movers,
          })
        : closeLead({
            today: t.today,
            todayPct: t.todayPct,
            movers: t.movers,
            quiet: t.quiet,
          });
  const top = t.movers[0] ?? null;
  const thesisTicker = top?.ticker;
  const thesisPos = thesisTicker
    ? t.positions.find((p) => p.ticker === thesisTicker) ?? null
    : null;

  return {
    kind: input.kind,
    title: TITLE[input.kind],
    dateLine: dateLine(now),
    shortDate: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Tallinn",
      day: "numeric",
      month: "short",
    }).format(now),
    book: t.book,
    nameCount: t.nameCount,
    todayLabel: input.kind === "sunday" ? "This week" : "Today",
    todayDollar: t.today,
    todayPct: t.todayPct,
    quiet: t.quiet,
    lead: copy.lead,
    subjectHook: copy.subjectHook,
    moversHeading:
      input.kind === "morning"
        ? "Overnight"
        : input.kind === "sunday"
          ? "What moved this week"
          : "What moved",
    movers,
    loudMovers: loudNoteMoves(t.movers, t.book),
    weights: t.weights,
    watches,
    perspective:
      input.kind === "sunday"
        ? perspectiveFor({
            weights: t.weights,
            movers: t.movers,
            earnings,
          })
        : [],
    thesis:
      input.kind === "close" && thesisPos
        ? thesisFor(thesisPos, t.book, input.conviction)
        : null,
    weekNotes:
      input.kind === "sunday"
        ? weekNotesFor(t.positions, input.conviction)
        : [],
    margus: null,
    insights: buildBookInsights(
      t.positions.map((p) => ({
        ticker: p.ticker,
        value: p.value,
        todayPct: p.pct,
      })),
      input.kind === "sunday" ? "this week" : "today"
    ).lines,
  };
}

export function noteReportText(r: NoteReport): string {
  const names =
    r.nameCount === 1 ? "1 name" : `${r.nameCount} names`;
  const extra = leftoverWatches(r);
  const lines = [notePreview(r), "", r.title, r.dateLine];
  if (r.kind === "morning") {
    lines.push("", `Your portfolio ${money(r.book)}. ${names}.`);
  } else {
    lines.push(
      "",
      `Your portfolio  ${money(r.book)}`,
      names,
      `${r.todayLabel}  ${signedMoney(r.todayDollar)}${
        r.todayPct != null ? `  ${signedPct(r.todayPct)}` : ""
      }`
    );
  }
  if (r.margus) {
    lines.push("", "Margus", r.margus, ADVICE_DISCLAIMER_SHORT);
  } else if (r.kind === "morning") {
    lines.push("", r.lead);
  }
  if (r.movers.length > 0) {
    lines.push("", r.moversHeading);
    for (const m of r.movers) {
      lines.push(
        `${cashtag(m.ticker)}  ${priceMoney(m.price)}  ${signedPct(m.pct)}  ${signedMoney(m.dollar)}`
      );
    }
  }
  if (r.kind === "sunday" && r.weights.length > 0) {
    lines.push("", "Where it sits");
    for (const w of r.weights) {
      lines.push(`${cashtag(w.ticker)}  ${weightPct(w.weight)} of your portfolio`);
    }
  }
  if (extra.length > 0) {
    lines.push("", "Look out for");
    for (const w of extra) lines.push(w.line);
  }
  lines.push("", "Turn these notes off in Account: https://upsidelab.app/account");
  return lines.join("\n");
}

const CREAM = EMAIL.cream;
const MUTED = EMAIL.muted;
const GOLD = EMAIL.gold;
const GAIN = EMAIL.gain;
const LOSS = EMAIL.loss;
const LINE = EMAIL.line;
const SANS = EMAIL.sans;
const BOOK_URL = EMAIL.origin;

function toneColor(n: number): string {
  if (n > 0) return GAIN;
  if (n < 0) return LOSS;
  return MUTED;
}

function kicker(text: string): string {
  return emailKicker(text);
}

function section(title: string, inner: string): string {
  return emailSection(title, inner);
}

function weightBar(weight: number): string {
  const pct = Math.max(4, Math.min(100, Math.round(Math.abs(weight) * 100)));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:${LINE};border-radius:2px">
  <tr>
    <td width="${pct}%" style="height:3px;background:${GOLD};font-size:0;line-height:0;border-radius:2px">&nbsp;</td>
    <td style="height:3px;font-size:0;line-height:0">&nbsp;</td>
  </tr>
</table>`;
}

function noteTakeHtml(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const chunks: string[] = [];
  let prose: string[] = [];
  let bullets: string[] = [];

  const flushProse = () => {
    if (prose.length === 0) return;
    const first = chunks.length === 0;
    chunks.push(
      `<p style="margin:${first ? "12px 0 0 0" : "18px 0 0 0"};font-family:${SANS};font-size:18px;line-height:1.6;font-weight:400;color:${CREAM}">${escapeHtml(prose.join(" "))}</p>`
    );
    prose = [];
  };
  const flushBullets = () => {
    if (bullets.length === 0) return;
    const rows = bullets
      .map(
        (item) =>
          `<tr>
  <td style="width:16px;padding:5px 0 5px 0;vertical-align:top;font-family:${SANS};font-size:18px;line-height:1.5;color:${GOLD}">•</td>
  <td style="padding:5px 0;font-family:${SANS};font-size:17px;line-height:1.5;font-weight:400;color:${CREAM}">${escapeHtml(item)}</td>
</tr>`
      )
      .join("");
    chunks.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0 0 0">${rows}</table>`
    );
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushProse();
      flushBullets();
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      flushProse();
      bullets.push(bullet[1] ?? "");
      continue;
    }
    flushBullets();
    prose.push(line);
  }
  flushProse();
  flushBullets();
  return chunks.join("");
}

export function noteReportHtml(r: NoteReport): string {
  const todayColor = toneColor(r.todayDollar);
  const names =
    r.nameCount === 1 ? "1 name" : `${r.nameCount} names`;
  const preview = notePreview(r);

  const moverRows = r.movers
    .map((m, i) => {
      const c = toneColor(m.dollar);
      const border = i === r.movers.length - 1 ? "none" : `1px solid ${LINE}`;
      return `<tr>
  <td style="padding:14px 12px 14px 0;border-bottom:${border};vertical-align:top">
    <p style="margin:0;font-family:${SANS};font-size:16px;font-weight:600;color:${CREAM}">${escapeHtml(cashtag(m.ticker))}</p>
    <p style="margin:4px 0 0 0;font-family:${SANS};font-size:13px;color:${MUTED}">${escapeHtml(priceMoney(m.price))}</p>
  </td>
  <td style="padding:14px 0;border-bottom:${border};vertical-align:top;text-align:right">
    <p style="margin:0;font-family:${SANS};font-size:16px;font-weight:600;color:${c}">${escapeHtml(signedPct(m.pct))}</p>
    <p style="margin:4px 0 0 0;font-family:${SANS};font-size:13px;color:${c}">${escapeHtml(signedMoney(m.dollar))}</p>
  </td>
</tr>`;
    })
    .join("");

  const moversInner =
    r.movers.length > 0
      ? section(
          r.moversHeading,
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">${moverRows}</table>`
        )
      : "";

  const weightRows = r.weights
    .map((w, i) => {
      const pad = i === r.weights.length - 1 ? "0" : "0 0 16px 0";
      return `<tr>
  <td style="padding:${pad}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">
      <tr>
        <td style="font-family:${SANS};font-size:15px;font-weight:600;color:${CREAM}">${escapeHtml(cashtag(w.ticker))}</td>
        <td style="font-family:${SANS};font-size:15px;font-weight:600;text-align:right;color:${CREAM}">${escapeHtml(weightPct(w.weight))}</td>
      </tr>
    </table>
    <div style="height:8px;font-size:0;line-height:0">&nbsp;</div>
    ${weightBar(w.weight)}
  </td>
</tr>`;
    })
    .join("");

  const weightsInner =
    r.kind === "sunday" && r.weights.length > 0
      ? section(
          "Where it sits",
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">${weightRows}</table>`
        )
      : "";

  const extraWatches = leftoverWatches(r);
  const watchRows = extraWatches
    .map((w, i) => {
      const n = String(i + 1).padStart(2, "0");
      const pad = i === extraWatches.length - 1 ? "0" : "0 0 16px 0";
      return `<tr>
  <td style="padding:${pad};width:28px;vertical-align:top;font-family:${SANS};font-size:12px;letter-spacing:0.08em;color:${GOLD}">${n}</td>
  <td style="padding:${pad};font-family:${SANS};font-size:15px;line-height:1.5;color:${CREAM}">${escapeHtml(w.line)}</td>
</tr>`;
    })
    .join("");
  const watchesInner =
    extraWatches.length > 0
      ? section(
          "Look out for",
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">${watchRows}</table>`
        )
      : "";

  const margusInner = r.margus
    ? emailCard(
        `${kicker("Margus")}<div style="height:10px;font-size:0;line-height:0">&nbsp;</div>${noteTakeHtml(r.margus)}<p style="margin:16px 0 0 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${MUTED}">${escapeHtml(ADVICE_DISCLAIMER_SHORT)}</p>`
      )
    : "";

  const heroInner =
    r.kind === "morning"
      ? `<p style="margin:0;font-family:${SANS};font-size:13px;letter-spacing:0.02em;color:${MUTED}">Your portfolio ${escapeHtml(money(r.book))}, ${escapeHtml(names)}</p>`
      : `<p style="margin:0;font-family:${SANS};font-size:40px;line-height:1.1;font-weight:700;letter-spacing:-0.03em;color:${CREAM}">${escapeHtml(signedMoney(r.todayDollar))}</p>
${
  r.todayPct != null
    ? `<p style="margin:12px 0 0 0;font-family:${SANS};font-size:16px;font-weight:600;color:${todayColor}">${escapeHtml(signedPct(r.todayPct))}</p>`
    : ""
}
<p style="margin:16px 0 0 0;font-family:${SANS};font-size:13px;letter-spacing:0.02em;color:${MUTED}">Your portfolio ${escapeHtml(money(r.book))}, ${escapeHtml(names)}</p>`;
  const hero = emailCard(`${kicker(r.title)}<div style="height:14px;font-size:0;line-height:0">&nbsp;</div>${heroInner}`);

  const bodyOrder =
    r.kind === "morning"
      ? `${margusInner}${watchesInner}${moversInner}`
      : r.kind === "sunday"
        ? `${margusInner}${moversInner}${weightsInner}`
        : `${margusInner}${moversInner}`;

  return wrapEmailLetter({
    title: r.title,
    preview,
    dateLine: r.dateLine,
    hideOpener: true,
    body: `<!-- ${escapeHtml(r.kind)} ${escapeHtml(r.shortDate)} ${escapeHtml(signedMoney(r.todayDollar))} -->
<div style="height:28px;font-size:0;line-height:0">&nbsp;</div>
${hero}
${bodyOrder}
${emailButton(BOOK_URL, "Open your portfolio")}`,
    footer: emailAccountFooter(),
  });
}

export function noteSubject(r: NoteReport): string {
  if (r.kind === "morning") {
    return `${r.subjectHook}, ${r.shortDate}`;
  }
  if (r.kind === "sunday") {
    return `${r.subjectHook} this week, ${r.shortDate}`;
  }
  return `${r.subjectHook} after the close, ${r.shortDate}`;
}
