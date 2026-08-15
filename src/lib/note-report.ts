/** Daily / close / Sunday note as a real report. HTML + plain text. */

import { cashtag } from "@/lib/format";
import { stripAiDashes } from "@/lib/ai/humanize-copy";
import { todayDollarFor } from "@/lib/overview";
import type { ConvictionMap } from "@/lib/conviction";
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

export type NoteReport = {
  kind: NoteKind;
  title: string;
  dateLine: string;
  greeting: string;
  lead: string;
  book: number;
  nameCount: number;
  todayLabel: string;
  todayDollar: number;
  todayPct: number | null;
  quiet: boolean;
  movers: NoteMover[];
  weights: NoteWeight[];
  thesis: NoteThesis | null;
  closer: string;
};

const TITLE: Record<NoteKind, string> = {
  morning: "Your book this morning",
  close: "After the close",
  sunday: "Sunday look",
};

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function priceMoney(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

function tape(input: NoteReportInput) {
  let equity = 0;
  let today = 0;
  const byTicker = new Map<string, Position>();
  for (const h of input.holdings) {
    const ticker = h.ticker.toUpperCase();
    if (!ticker) continue;
    const q = input.quotes[ticker];
    const price = q?.price ?? h.buy_price;
    const value = h.shares * price;
    const move = todayDollarFor(value, q?.changePercent);
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
  return {
    book,
    today,
    todayPct: prevBook !== 0 ? today / prevBook : null,
    movers,
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
  const isStatus = /^(thesis intact|watch|thesis at risk)$/i.test(verdict);
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
    status: isStatus ? verdict : null,
  };
}

export function parseConviction(raw: unknown): ConvictionMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ConvictionMap;
}

export function buildNoteReport(input: NoteReportInput): NoteReport {
  const now = input.now ?? new Date();
  const t = tape(input);
  const top = t.movers[0] ?? null;
  const byPct = [...t.movers].sort((a, b) => b.pct - a.pct);
  const name = input.name?.trim() || null;
  const greeting = name ? `${name},` : "Hey,";

  let lead: string;
  let closer: string;
  if (input.kind === "sunday") {
    lead = t.quiet
      ? "A quiet stretch. The book is where you left it."
      : "A look at the book before the week starts.";
    closer = "That's enough for a Sunday.";
  } else if (input.kind === "close") {
    lead = t.quiet
      ? "The session is over. Not much happened."
      : "The session is over. Here is what actually moved.";
    closer = "See you in the morning.";
  } else {
    lead = t.quiet
      ? "Prices are in. The book barely moved."
      : "Prices are in. Here is the day so far.";
    closer = "Nothing you have to do.";
  }

  const thesisTicker =
    input.kind === "sunday" ? (byPct[0]?.ticker ?? top?.ticker) : top?.ticker;
  const thesisPos = thesisTicker
    ? t.positions.find((p) => p.ticker === thesisTicker) ?? null
    : null;

  return {
    kind: input.kind,
    title: TITLE[input.kind],
    dateLine: dateLine(now),
    greeting,
    lead,
    book: t.book,
    nameCount: t.nameCount,
    todayLabel: input.kind === "sunday" ? "Last session" : "Today",
    todayDollar: t.today,
    todayPct: t.todayPct,
    quiet: t.quiet,
    movers: t.movers.slice(0, 5),
    weights: t.weights,
    thesis: thesisPos ? thesisFor(thesisPos, t.book, input.conviction) : null,
    closer,
  };
}

export function noteReportText(r: NoteReport): string {
  const names =
    r.nameCount === 1 ? "1 name" : `${r.nameCount} names`;
  const lines = [
    r.title,
    r.dateLine,
    "",
    r.greeting,
    r.lead,
    "",
    `Your book  ${money(r.book)}`,
    names,
    `${r.todayLabel}  ${signedMoney(r.todayDollar)}${
      r.todayPct != null ? `  ${signedPct(r.todayPct)}` : ""
    }`,
  ];
  if (r.movers.length > 0) {
    lines.push("", "What moved");
    for (const m of r.movers) {
      lines.push(
        `${cashtag(m.ticker)}  ${priceMoney(m.price)}  ${signedPct(m.pct)}  ${signedMoney(m.dollar)}`
      );
    }
  }
  if (r.weights.length > 0) {
    lines.push("", "Where it sits");
    for (const w of r.weights) {
      lines.push(`${cashtag(w.ticker)}  ${weightPct(w.weight)} of the book`);
    }
  }
  if (r.thesis) {
    const heading = r.thesis.ownerThesis
      ? `Thesis  ${cashtag(r.thesis.ticker)}`
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
    if (r.thesis.status) lines.push(`Last Pulse: ${r.thesis.status}.`);
    if (r.thesis.pulseLine) lines.push(r.thesis.pulseLine);
    if (!r.thesis.ownerThesis && !r.thesis.pulseLine) {
      lines.push(
        `No thesis on file for ${cashtag(r.thesis.ticker)} yet. One sentence in the app is enough.`
      );
    }
  }
  lines.push("", r.closer, "", "Account turns this off.");
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
const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

function toneColor(n: number): string {
  if (n > 0) return GAIN;
  if (n < 0) return LOSS;
  return MUTED;
}

function label(text: string): string {
  return `<p style="margin:0 0 10px 0;font-family:${SANS};font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${GOLD}">${escapeHtml(text)}</p>`;
}

function panel(inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:${CARD};border:1px solid #3c352a;border-radius:16px">
  <tr><td style="padding:18px 18px">${inner}</td></tr>
</table>`;
}

function section(title: string, inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:20px 0 0 0">
  <tr><td>${label(title)}</td></tr>
  <tr><td>${panel(inner)}</td></tr>
</table>`;
}

function weightBar(weight: number): string {
  const pct = Math.max(4, Math.min(100, Math.round(Math.abs(weight) * 100)));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:${LINE};border-radius:2px">
  <tr>
    <td width="${pct}%" style="height:4px;background:${GOLD};font-size:0;line-height:0;border-radius:2px">&nbsp;</td>
    <td style="height:4px;font-size:0;line-height:0">&nbsp;</td>
  </tr>
</table>`;
}

export function noteReportHtml(r: NoteReport): string {
  const todayColor = toneColor(r.todayDollar);
  const todayLine = `${signedMoney(r.todayDollar)}${
    r.todayPct != null ? `&nbsp;&nbsp;${escapeHtml(signedPct(r.todayPct))}` : ""
  }`;
  const names =
    r.nameCount === 1 ? "1 name" : `${r.nameCount} names`;
  const preview = `${r.title}. ${money(r.book)}. ${r.todayLabel} ${signedMoney(r.todayDollar)}.`;

  const moverRows = r.movers
    .map((m, i) => {
      const c = toneColor(m.dollar);
      const border = i === r.movers.length - 1 ? "none" : `1px solid ${LINE}`;
      return `<tr>
  <td style="padding:12px 8px 12px 0;font-family:${SANS};font-size:15px;font-weight:600;color:${CREAM};border-bottom:${border}">${escapeHtml(cashtag(m.ticker))}</td>
  <td style="padding:12px 8px;font-family:${SANS};font-size:14px;text-align:right;color:${MUTED};border-bottom:${border}">${escapeHtml(priceMoney(m.price))}</td>
  <td style="padding:12px 8px;font-family:${SANS};font-size:15px;font-weight:600;text-align:right;color:${c};border-bottom:${border}">${escapeHtml(signedPct(m.pct))}</td>
  <td style="padding:12px 0 12px 8px;font-family:${SANS};font-size:15px;font-weight:600;text-align:right;color:${c};border-bottom:${border}">${escapeHtml(signedMoney(m.dollar))}</td>
</tr>`;
    })
    .join("");

  const moversInner =
    r.movers.length > 0
      ? section(
          "What moved",
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">${moverRows}</table>`
        )
      : "";

  const weightRows = r.weights
    .map((w, i) => {
      const pad = i === r.weights.length - 1 ? "0" : "0 0 14px 0";
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
    r.weights.length > 0
      ? section(
          "Where it sits",
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">${weightRows}</table>`
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
      .join(" · ");
    bits.push(
      `<p style="margin:8px 0 0 0;font-family:${SANS};font-size:13px;color:${MUTED}">${escapeHtml(factBits)}</p>`
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
        `<p style="margin:14px 0 0 0;font-family:${SANS};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD}">Last Pulse · ${escapeHtml(r.thesis.status)}</p>`
      );
    }
    if (r.thesis.pulseLine) {
      bits.push(
        `<p style="margin:8px 0 0 0;font-family:${SANS};font-size:15px;line-height:1.55;color:${MUTED}">${escapeHtml(r.thesis.pulseLine)}</p>`
      );
    }
    if (!r.thesis.ownerThesis && !r.thesis.pulseLine) {
      bits.push(
        `<p style="margin:14px 0 0 0;font-family:${SANS};font-size:15px;line-height:1.55;color:${MUTED}">No thesis on file for ${escapeHtml(cashtag(r.thesis.ticker))} yet. One sentence in the app is enough.</p>`
      );
    }
    const heading = r.thesis.ownerThesis ? "Thesis" : "Focus";
    thesisInner = section(heading, bits.join(""));
  }

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
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${APP}" style="width:100%;background:${APP}">
  <tr>
    <td style="padding:0;background:${APP}" bgcolor="${APP}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:${APP}">
        <tr>
          <td style="padding:22px 16px 28px 16px;background:${APP}">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%">
              <tr>
                <td style="vertical-align:middle">
                  <img src="https://www.upsidelab.app/icons/icon-192.png" width="28" height="28" alt="" style="display:block;border:0;border-radius:8px" />
                </td>
                <td style="vertical-align:middle;padding-left:10px;font-family:${SANS};font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${GOLD}">Upside Lab</td>
                <td style="vertical-align:middle;text-align:right;font-family:${SANS};font-size:12px;color:${MUTED}">${escapeHtml(r.dateLine)}</td>
              </tr>
            </table>
            <h1 style="margin:22px 0 0 0;font-family:${SANS};font-size:24px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:${CREAM}">${escapeHtml(r.title)}</h1>
            <p style="margin:10px 0 0 0;font-family:${SANS};font-size:15px;line-height:1.5;color:${MUTED}">${escapeHtml(r.greeting)} ${escapeHtml(r.lead)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:22px 0 0 0">
              <tr>
                <td>
                  ${panel(`
                    ${label("Your book")}
                    <p style="margin:0;font-family:${SANS};font-size:32px;line-height:1.1;font-weight:700;letter-spacing:-0.02em;color:${CREAM}">${escapeHtml(money(r.book))}</p>
                    <p style="margin:8px 0 0 0;font-family:${SANS};font-size:13px;color:${MUTED}">${escapeHtml(names)}</p>
                    <p style="margin:14px 0 0 0;font-family:${SANS};font-size:16px;font-weight:600;color:${todayColor}">${escapeHtml(r.todayLabel)} ${todayLine}</p>
                  `)}
                </td>
              </tr>
            </table>
            ${moversInner}
            ${weightsInner}
            ${thesisInner}
            <p style="margin:24px 0 0 0;font-family:${SANS};font-size:15px;line-height:1.5;color:${MUTED}">${escapeHtml(r.closer)}</p>
            <p style="margin:20px 0 0 0;font-family:${SANS};font-size:12px;line-height:1.5;color:#6b7280">Account turns this off · upsidelab.app</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function noteSubject(kind: NoteKind): string {
  return TITLE[kind];
}
