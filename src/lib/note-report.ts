/** Daily / close / Sunday note as a real report. HTML + plain text. */

import { cashtag } from "@/lib/format";
import { stripAiDashes } from "@/lib/ai/humanize-copy";
import { statusLabel } from "@/lib/thesis-pulse";
import { buildBookInsights } from "@/lib/book-insights";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
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

export function notePreview(r: NoteReport): string {
  if (r.kind === "morning") {
    return r.lead;
  }
  const top = r.movers[0];
  const pctBit =
    r.todayPct != null
      ? `${signedPct(r.todayPct)} on the book`
      : "Prices are still coming in";
  if (r.kind === "sunday") {
    const next = r.watches[0]?.line ?? r.perspective[0];
    if (next) return `${pctBit}. ${next}`;
  }
  if (top) {
    return `${pctBit}. ${cashtag(top.ticker)} did most of the move.`;
  }
  return `${pctBit}. Open the note for the full look.`;
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

  if (risk || action === "sell") return "Reason looks shaky. Do not add this week.";
  if (watch || action === "watch") return "Wait. Best thing this week is to wait.";
  if (action === "trim") {
    return "Reason still holds. If it ran too far, sell some. Otherwise do nothing.";
  }
  if (action === "add" || (intact && down)) {
    return "Reason still holds. Look to add this week on the dip.";
  }
  if (intact && upHot) {
    return "Reason still holds. If it ran too far, sell some. Otherwise do nothing.";
  }
  if (intact || action === "hold") {
    return "Reason still holds. Best thing this week is nothing.";
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

  if (risk || action === "sell") return "Do not add today.";
  if (watch || action === "watch") return "Wait. Best thing today is to wait.";
  if (action === "trim") return "If it runs, sell some. Don't chase.";
  if (action === "add" || (intact && down)) {
    return "Reason still holds. Look to add if it dips.";
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
      `${cashtag(top.ticker)} is ${weightPct(top.weight)} of the book. The next couple of weeks mostly ride on it.`
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
      `${cashtag(worst.ticker)} had the rough week. If the reason you own it is still true, that's a dip, not a new story.`
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
  const add = input.watches.find((w) => /look to add/i.test(w.line));
  if (add?.ticker) {
    return {
      lead: `${cashtag(add.ticker)}. Reason still holds. Look to add if it dips.`,
      subjectHook: `Look to add ${cashtag(add.ticker)}`,
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
      lead: "Quiet day. Book barely moved.",
      subjectHook: hook,
    };
  }
  const top = input.movers[0];
  return {
    lead: top
      ? `${signedMoney(input.today)} on the book. ${cashtag(top.ticker)} was the name that did it.`
      : `${signedMoney(input.today)} on the book.`,
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
  const bits = [`${signedMoney(input.today)} this week.`];
  if (best && best.pct > 0) {
    bits.push(`${cashtag(best.ticker)} was the gainer.`);
  }
  if (worst && worst.ticker !== best?.ticker && worst.pct < 0) {
    bits.push(`${cashtag(worst.ticker)} was the drop.`);
  }
  return { lead: bits.join(" "), subjectHook: hook };
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
      }))
    ).lines,
  };
}

export function noteReportText(r: NoteReport): string {
  const names =
    r.nameCount === 1 ? "1 name" : `${r.nameCount} names`;
  const lines = [notePreview(r), "", r.title, r.dateLine, "", r.lead];
  if (r.margus) {
    lines.push("", "Margus", r.margus, ADVICE_DISCLAIMER_SHORT);
  }
  if (r.kind !== "morning") {
    lines.push(
      "",
      `Your book  ${money(r.book)}`,
      names,
      `${r.todayLabel}  ${signedMoney(r.todayDollar)}${
        r.todayPct != null ? `  ${signedPct(r.todayPct)}` : ""
      }`
    );
  } else {
    lines.push("", `Book ${money(r.book)}. ${names}.`);
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
      lines.push(`${cashtag(w.ticker)}  ${weightPct(w.weight)} of the book`);
    }
  }
  if (r.kind === "morning" && r.watches.length > 0) {
    lines.push("", "Look out for");
    for (const w of r.watches) lines.push(w.line);
  }
  if (r.insights.length > 0) {
    lines.push("", "Worth noticing");
    for (const line of r.insights) lines.push(line);
  }
  if (r.thesis) {
    const heading = r.thesis.ownerThesis
      ? `Why you own it  ${cashtag(r.thesis.ticker)}`
      : `Focus  ${cashtag(r.thesis.ticker)}`;
    lines.push("", heading);
    const facts = [
      `${Math.round(r.thesis.shares).toLocaleString("en-US")} shares at ${priceMoney(r.thesis.price)}`,
      r.thesis.weight != null ? `${weightPct(r.thesis.weight)} of the book` : null,
      r.thesis.todayPct != null
        ? `${r.todayLabel} ${signedPct(r.thesis.todayPct)}  ${signedMoney(r.thesis.todayDollar)}`
        : null,
    ].filter((x): x is string => Boolean(x));
    lines.push(facts.join(". ") + ".");
    if (r.thesis.ownerThesis) lines.push(r.thesis.ownerThesis);
    if (r.thesis.status) lines.push(`Pulse: ${r.thesis.status}.`);
    if (r.thesis.pulseLine) lines.push(r.thesis.pulseLine);
  }
  if (r.kind === "sunday") {
    if (r.perspective.length > 0) {
      lines.push("", "The next couple of weeks");
      for (const p of r.perspective) lines.push(p);
    }
    if (r.weekNotes.length > 0) {
      lines.push("", "Ideas for next week");
      for (const n of r.weekNotes) {
        lines.push(cashtag(n.ticker));
        if (n.status) lines.push(n.status);
        if (n.ownerThesis) lines.push(n.ownerThesis);
        if (n.pulseLine) lines.push(n.pulseLine);
        if (n.actionLine) lines.push(n.actionLine);
      }
    }
  }
  lines.push("", "Turn these notes off in Account: https://upsidelab.app/account");
  return lines.join("\n");
}

const APP = "#08090c";
const CARD = "#111318";
const CREAM = "#f4f1ea";
const MUTED = "#9aa3ad";
const GOLD = "#d6ad69";
const GAIN = "#10b981";
const LOSS = "#f43f5e";
const LINE = "#1c1f27";
const EDGE = "#2a261e";
const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const BOOK_URL = "https://upsidelab.app";
const LOCKUP =
  "https://upsidelab.app/icons/email-lockup.png?v=1";

function toneColor(n: number): string {
  if (n > 0) return GAIN;
  if (n < 0) return LOSS;
  return MUTED;
}

function kicker(text: string): string {
  return `<p style="margin:0;font-family:${SANS};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD}">${escapeHtml(text)}</p>`;
}

function label(text: string): string {
  return `<p style="margin:0 0 12px 0;font-family:${SANS};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD}">${escapeHtml(text)}</p>`;
}

function panel(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:${CARD};border:1px solid ${EDGE};border-radius:14px">
  <tr><td style="padding:20px 20px">${inner}</td></tr>
</table>`;
}

function section(title: string, inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:28px 0 0 0">
  <tr><td>${label(title)}</td></tr>
  <tr><td>${panel(inner)}</td></tr>
</table>`;
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

function openBookButton(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:32px 0 0 0">
  <tr>
    <td bgcolor="${GOLD}" style="border-radius:10px">
      <a href="${BOOK_URL}" style="display:inline-block;padding:12px 18px;font-family:${SANS};font-size:14px;font-weight:600;color:${APP};text-decoration:none">Open the book</a>
    </td>
  </tr>
</table>`;
}

export function noteReportHtml(r: NoteReport): string {
  const todayColor = toneColor(r.todayDollar);
  const names =
    r.nameCount === 1 ? "1 name" : `${r.nameCount} names`;
  const preview = notePreview(r);
  const previewPad = Array.from({ length: 40 }, () => "&zwnj;&nbsp;").join("");
  const topPad = r.kind === "sunday" ? "36px" : "28px";

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

  const watchRows = r.watches
    .map((w, i) => {
      const n = String(i + 1).padStart(2, "0");
      const pad = i === r.watches.length - 1 ? "0" : "0 0 16px 0";
      return `<tr>
  <td style="padding:${pad};width:28px;vertical-align:top;font-family:${SANS};font-size:12px;letter-spacing:0.08em;color:${GOLD}">${n}</td>
  <td style="padding:${pad};font-family:${SANS};font-size:15px;line-height:1.5;color:${CREAM}">${escapeHtml(w.line)}</td>
</tr>`;
    })
    .join("");
  const watchesInner =
    r.kind === "morning" && r.watches.length > 0
      ? section(
          "Look out for",
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">${watchRows}</table>`
        )
      : "";

  const insightsInner =
    r.insights.length > 0
      ? section(
          "Worth noticing",
          r.insights
            .map(
              (line, i) =>
                `<p style="margin:${i === 0 ? "0" : "12px 0 0 0"};font-family:${SANS};font-size:15px;line-height:1.55;color:${CREAM}">${escapeHtml(line)}</p>`
            )
            .join("")
        )
      : "";

  const margusInner = r.margus
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:28px 0 0 0">
  <tr>
    <td style="width:3px;background:${GOLD};font-size:0;line-height:0;border-radius:2px">&nbsp;</td>
    <td style="padding:2px 0 2px 16px">
      ${kicker("Margus")}
      <p style="margin:10px 0 0 0;font-family:${SANS};font-size:18px;line-height:1.5;font-weight:500;color:${CREAM}">${escapeHtml(r.margus)}</p>
      <p style="margin:12px 0 0 0;font-family:${SANS};font-size:12px;line-height:1.45;color:#6b7280">${escapeHtml(ADVICE_DISCLAIMER_SHORT)}</p>
    </td>
  </tr>
</table>`
    : "";

  const perspectiveInner =
    r.kind === "sunday" && r.perspective.length > 0
      ? section(
          "The next couple of weeks",
          r.perspective
            .map(
              (p, i) =>
                `<p style="margin:${i === 0 ? "0" : "14px 0 0 0"};font-family:${SANS};font-size:16px;line-height:1.55;color:${CREAM}">${escapeHtml(p)}</p>`
            )
            .join("")
        )
      : "";

  let thesisInner = "";
  if (r.thesis) {
    const bits: string[] = [];
    bits.push(
      `<p style="margin:0;font-family:${SANS};font-size:18px;font-weight:700;color:${CREAM}">${escapeHtml(cashtag(r.thesis.ticker))}</p>`
    );
    const factBits = [
      `${Math.round(r.thesis.shares).toLocaleString("en-US")} shares at ${priceMoney(r.thesis.price)}`,
      r.thesis.weight != null ? `${weightPct(r.thesis.weight)} of the book` : null,
    ]
      .filter((x): x is string => Boolean(x))
      .join(", ");
    bits.push(
      `<p style="margin:6px 0 0 0;font-family:${SANS};font-size:13px;color:${MUTED}">${escapeHtml(factBits)}</p>`
    );
    if (r.thesis.todayPct != null) {
      bits.push(
        `<p style="margin:12px 0 0 0;font-family:${SANS};font-size:16px;font-weight:600;color:${toneColor(r.thesis.todayDollar)}">${escapeHtml(r.todayLabel)} ${escapeHtml(signedPct(r.thesis.todayPct))}&nbsp;&nbsp;${escapeHtml(signedMoney(r.thesis.todayDollar))}</p>`
      );
    }
    if (r.thesis.ownerThesis) {
      bits.push(
        `<p style="margin:14px 0 0 0;font-family:${SANS};font-size:15px;line-height:1.55;color:${CREAM}">${escapeHtml(r.thesis.ownerThesis)}</p>`
      );
    }
    if (r.thesis.status) {
      bits.push(
        `<p style="margin:14px 0 0 0;font-family:${SANS};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD}">Pulse: ${escapeHtml(r.thesis.status)}</p>`
      );
    }
    if (r.thesis.pulseLine) {
      bits.push(
        `<p style="margin:8px 0 0 0;font-family:${SANS};font-size:15px;line-height:1.55;color:${MUTED}">${escapeHtml(r.thesis.pulseLine)}</p>`
      );
    }
    thesisInner = section(
      r.thesis.ownerThesis ? "The name that did it" : "Focus",
      bits.join("")
    );
  }

  const weekNoteCards = r.weekNotes
    .map((n, i) => {
      const bits: string[] = [];
      bits.push(
        `<p style="margin:0;font-family:${SANS};font-size:18px;font-weight:700;color:${CREAM}">${escapeHtml(cashtag(n.ticker))}</p>`
      );
      if (n.status) {
        bits.push(
          `<p style="margin:6px 0 0 0;font-family:${SANS};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${GOLD}">${escapeHtml(n.status)}</p>`
        );
      }
      if (n.ownerThesis) {
        bits.push(
          `<p style="margin:10px 0 0 0;font-family:${SANS};font-size:15px;line-height:1.55;color:${CREAM}">${escapeHtml(n.ownerThesis)}</p>`
        );
      }
      if (n.pulseLine) {
        bits.push(
          `<p style="margin:8px 0 0 0;font-family:${SANS};font-size:15px;line-height:1.55;color:${MUTED}">${escapeHtml(n.pulseLine)}</p>`
        );
      }
      if (n.actionLine) {
        bits.push(
          `<p style="margin:12px 0 0 0;font-family:${SANS};font-size:16px;font-weight:600;line-height:1.45;color:${CREAM}">${escapeHtml(n.actionLine)}</p>`
        );
      }
      const pad = i === r.weekNotes.length - 1 ? "0" : "0 0 22px 0";
      return `<tr><td style="padding:${pad}">${bits.join("")}</td></tr>`;
    })
    .join("");

  const weekNotesInner =
    r.weekNotes.length > 0
      ? section(
          "Ideas for next week",
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">${weekNoteCards}</table>`
        )
      : "";

  const hero =
    r.kind === "morning"
      ? `<p style="margin:18px 0 0 0;font-family:${SANS};font-size:22px;line-height:1.35;font-weight:600;letter-spacing:-0.02em;color:${CREAM}">${escapeHtml(r.lead)}</p>
<p style="margin:12px 0 0 0;font-family:${SANS};font-size:13px;color:${MUTED}">Book ${escapeHtml(money(r.book))}, ${escapeHtml(names)}</p>`
      : `<p style="margin:18px 0 0 0;font-family:${SANS};font-size:40px;line-height:1.05;font-weight:700;letter-spacing:-0.03em;color:${todayColor}">${escapeHtml(signedMoney(r.todayDollar))}</p>
${
  r.todayPct != null
    ? `<p style="margin:8px 0 0 0;font-family:${SANS};font-size:16px;font-weight:600;color:${todayColor}">${escapeHtml(signedPct(r.todayPct))} ${escapeHtml(r.todayLabel.toLowerCase())}</p>`
    : ""
}
<p style="margin:10px 0 0 0;font-family:${SANS};font-size:13px;color:${MUTED}">Book ${escapeHtml(money(r.book))}, ${escapeHtml(names)}</p>
<p style="margin:16px 0 0 0;font-family:${SANS};font-size:17px;line-height:1.45;color:${CREAM}">${escapeHtml(r.lead)}</p>`;

  const bodyOrder =
    r.kind === "morning"
      ? `${margusInner}${watchesInner}${insightsInner}${moversInner}`
      : r.kind === "sunday"
        ? `${margusInner}${moversInner}${weightsInner}${insightsInner}${perspectiveInner}${weekNotesInner}`
        : `${margusInner}${moversInner}${insightsInner}${thesisInner}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>${escapeHtml(r.title)}</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin:0 !important; padding:0 !important; background:${APP} !important; width:100% !important; }
</style>
</head>
<body style="margin:0;padding:0;width:100%;background:${APP};color:${CREAM}" bgcolor="${APP}">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(preview)}${previewPad}</div>
<!-- ${escapeHtml(r.kind)} ${escapeHtml(r.shortDate)} ${escapeHtml(signedMoney(r.todayDollar))} -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${APP}" style="width:100%;background:${APP}">
  <tr>
    <td align="center" style="padding:0;background:${APP}" bgcolor="${APP}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background:${APP}">
        <tr>
          <td style="height:3px;background:${GOLD};font-size:0;line-height:0">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:${topPad} 24px 40px 24px;background:${APP}">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">
              <tr>
                <td style="vertical-align:middle">
                  <img src="${LOCKUP}" width="156" height="29" alt="Upside Lab" style="display:block;border:0" />
                </td>
                <td style="vertical-align:middle;text-align:right;font-family:${SANS};font-size:12px;color:${MUTED}">${escapeHtml(r.dateLine)}</td>
              </tr>
            </table>
            <div style="height:22px;font-size:0;line-height:0">&nbsp;</div>
            ${kicker(r.title)}
            ${hero}
            ${bodyOrder}
            ${openBookButton()}
            <p style="margin:28px 0 0 0;font-family:${SANS};font-size:12px;line-height:1.5;color:#6b7280">Turn these notes off in <a href="https://upsidelab.app/account" style="color:#9aa3ad;text-decoration:underline">Account</a>.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
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
