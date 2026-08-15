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

function toneColor(n: number): string {
  if (n > 0) return "#2f6b45";
  if (n < 0) return "#9a3f3f";
  return "#5c574e";
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
      const border = i === r.movers.length - 1 ? "none" : "1px solid #ece7dc";
      return `<tr>
  <td style="padding:10px 8px 10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;color:#1a1814;border-bottom:${border}">${escapeHtml(cashtag(m.ticker))}</td>
  <td style="padding:10px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;text-align:right;color:#8a7d68;border-bottom:${border}">${escapeHtml(priceMoney(m.price))}</td>
  <td style="padding:10px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;text-align:right;color:${c};border-bottom:${border}">${escapeHtml(signedPct(m.pct))}</td>
  <td style="padding:10px 0 10px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;text-align:right;color:${c};border-bottom:${border}">${escapeHtml(signedMoney(m.dollar))}</td>
</tr>`;
    })
    .join("");

  let thesisInner = "";
  if (r.thesis) {
    const bits: string[] = [];
    const factBits = [
      `${Math.round(r.thesis.shares).toLocaleString("en-US")} shares at ${priceMoney(r.thesis.price)}`,
      r.thesis.weight != null ? `${weightPct(r.thesis.weight)} of the book` : null,
    ]
      .filter((x): x is string => Boolean(x))
      .join(" · ");
    bits.push(
      `<p style="margin:0 0 10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#8a7d68">${escapeHtml(factBits)}</p>`
    );
    if (r.thesis.todayPct != null) {
      bits.push(
        `<p style="margin:0 0 12px 0;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:${toneColor(r.thesis.todayDollar)}">${escapeHtml(r.todayLabel)} ${escapeHtml(signedPct(r.thesis.todayPct))}&nbsp;&nbsp;${escapeHtml(signedMoney(r.thesis.todayDollar))}</p>`
      );
    }
    if (r.thesis.ownerThesis) {
      bits.push(
        `<p style="margin:0 0 12px 0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.5;color:#1a1814">${escapeHtml(r.thesis.ownerThesis)}</p>`
      );
    }
    if (r.thesis.status) {
      bits.push(
        `<p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#8a7d68">Last Pulse · ${escapeHtml(r.thesis.status)}</p>`
      );
    }
    if (r.thesis.pulseLine) {
      bits.push(
        `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#3d3830">${escapeHtml(r.thesis.pulseLine)}</p>`
      );
    }
    if (!r.thesis.ownerThesis && !r.thesis.pulseLine) {
      bits.push(
        `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#3d3830">No thesis on file for ${escapeHtml(cashtag(r.thesis.ticker))} yet. One sentence in the app is enough.</p>`
      );
    }
    const heading = r.thesis.ownerThesis
      ? `Thesis · ${cashtag(r.thesis.ticker)}`
      : `Focus · ${cashtag(r.thesis.ticker)}`;
    thesisInner = `
      <p style="margin:28px 0 10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8a7d68">${escapeHtml(heading)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe6;border-left:3px solid #c4a67a">
        <tr><td style="padding:16px 18px">${bits.join("")}</td></tr>
      </table>`;
  }

  const weightRows = r.weights
    .map((w, i) => {
      const border = i === r.weights.length - 1 ? "none" : "1px solid #ece7dc";
      return `<tr>
  <td style="padding:10px 8px 10px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;color:#1a1814;border-bottom:${border}">${escapeHtml(cashtag(w.ticker))}</td>
  <td style="padding:10px 0 10px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;text-align:right;color:#1a1814;border-bottom:${border}">${escapeHtml(weightPct(w.weight))}</td>
</tr>`;
    })
    .join("");

  const weightsInner =
    r.weights.length > 0
      ? `<p style="margin:28px 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8a7d68">Where it sits</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${weightRows}</table>`
      : "";

  const moversInner =
    r.movers.length > 0
      ? `<p style="margin:28px 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8a7d68">What moved</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${moverRows}</table>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(r.title)}</title>
</head>
<body style="margin:0;padding:0;background:#efeae0">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efeae0">
  <tr>
    <td align="center" style="padding:28px 16px 40px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fbf8f1;border:1px solid #e4ddcf">
        <tr>
          <td style="padding:28px 28px 0 28px">
            <img src="https://www.upsidelab.app/icons/icon-192.png" width="36" height="36" alt="" style="display:block;border:0;border-radius:8px" />
            <p style="margin:16px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#8a7d68">Upside Lab</p>
            <h1 style="margin:8px 0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;font-weight:normal;color:#1a1814">${escapeHtml(r.title)}</h1>
            <p style="margin:8px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#8a7d68">${escapeHtml(r.dateLine)}</p>
            <div style="height:1px;background:#c4a67a;margin:22px 0 0 0;line-height:1px;font-size:1px">&nbsp;</div>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 28px 0 28px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.5;color:#3d3830">
            <p style="margin:0">${escapeHtml(r.greeting)}</p>
            <p style="margin:8px 0 0 0">${escapeHtml(r.lead)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 28px 0 28px">
            <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8a7d68">Your book</p>
            <p style="margin:8px 0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:1.1;color:#1a1814">${escapeHtml(money(r.book))}</p>
            <p style="margin:8px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#8a7d68">${escapeHtml(names)}</p>
            <p style="margin:14px 0 0 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;color:${todayColor}">${escapeHtml(r.todayLabel)} ${todayLine}</p>
            ${moversInner}
            ${weightsInner}
            ${thesisInner}
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 0 28px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.5;color:#3d3830">
            ${escapeHtml(r.closer)}
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 28px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;line-height:1.5;color:#9a9386">
            Account turns this off · upsidelab.app
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
