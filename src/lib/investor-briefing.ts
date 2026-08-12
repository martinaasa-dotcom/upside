import type { CoveredCallRow } from "@/lib/types";
import type { OverviewModel } from "@/lib/overview";
import type { CashflowEntry } from "@/lib/cashflow";
import type { UpsideAlert } from "@/lib/alerts";
import { todayKeyInTz } from "@/lib/timezone";
import { hashSeed, mulberry32, pick } from "@/lib/seeded-rng";

export type BriefingLink =
  | { type: "lab"; tab: "alerts" | "versus" | "season" }
  | { type: "pulse" }
  | { type: "sheet"; portfolioId: string }
  | { type: "compound" };

export type BriefingItem = {
  id: string;
  kind: "action" | "watch" | "play";
  title: string;
  detail: string;
  ticker?: string;
  link?: BriefingLink;
  cta?: string;
};

function pct1(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

function money(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function dayMoney(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${money(Math.abs(n))}`;
}

function sheetMostCash(model: OverviewModel): string | undefined {
  const sorted = [...model.sheets].sort(
    (a, b) => b.portfolio.cash_balance - a.portfolio.cash_balance
  );
  return sorted[0]?.portfolio.id;
}

/**
 * Daily investor briefing — what to know when you open Upside.
 *
 * Earnings-soon / near-strike / margin / concentration used to be
 * re-derived here with their own thresholds AND separately in Lab's Alerts
 * tab — two independently-tunable copies of the same conditions that could
 * silently drift apart, with no shared dismissal state. Alerts (Lab) is now
 * the one place that decides what qualifies and the one place you dismiss
 * from; this briefing just points at that same list. Everything below is
 * genuinely unique to the daily-glance narrative (today's $, CC season,
 * dry powder, rotating "what to do" plays).
 */
export function buildInvestorBriefing(input: {
  model: OverviewModel;
  activeAlerts: UpsideAlert[];
  coveredCallRows: CoveredCallRow[];
  cashflows: CashflowEntry[];
  dayKey?: string;
}): BriefingItem[] {
  const dayKey = input.dayKey ?? todayKeyInTz();
  const { model, activeAlerts, coveredCallRows, cashflows } = input;
  const items: BriefingItem[] = [];

  const today$ = model.totals.todayDollar;
  const todayPct = model.totals.todayPct;
  const dayRng = mulberry32(hashSeed(`upside-briefing-day|${dayKey}|${Math.round(today$)}`));
  items.push({
    id: `day-${dayKey}`,
    kind: "watch",
    title: `Book is ${dayMoney(today$)} on the day`,
    detail:
      todayPct != null
        ? pick(dayRng, [
            `${pct1(todayPct)} across the book. If nothing needs a write-plan tweak, waiting is the job.`,
            `${pct1(todayPct)} on the session. Nothing to do unless a write plan actually needs one.`,
            `${pct1(todayPct)} today. Check Thesis Pulse if anything moved enough to matter; otherwise it's a nothing-burger day.`,
          ])
        : "Quotes still settling — open, skim, close.",
    link: { type: "pulse" },
    cta: "Thesis pulse →",
  });

  if (activeAlerts.length > 0) {
    const top = activeAlerts[0]!;
    items.push({
      id: `alerts-${dayKey}`,
      kind: "action",
      title:
        activeAlerts.length === 1
          ? top.title
          : `${activeAlerts.length} things need a look`,
      detail:
        activeAlerts.length === 1
          ? top.detail
          : activeAlerts
              .slice(0, 3)
              .map((a) => a.title)
              .join(" · "),
      ticker: top.ticker,
      link: { type: "lab", tab: "alerts" },
      cta: "Open Alerts →",
    });
  }

  const openPrem = coveredCallRows.reduce((s, r) => s + (r.premium ?? 0), 0);
  const monthPrem = cashflows
    .filter((c) => {
      if (c.kind !== "premium") return false;
      const d = new Date(c.at);
      const now = new Date();
      return (
        d.getUTCFullYear() === now.getUTCFullYear() &&
        d.getUTCMonth() === now.getUTCMonth()
      );
    })
    .reduce((s, c) => s + c.amount, 0);

  if (openPrem > 0 || monthPrem > 0) {
    const rng = mulberry32(
      hashSeed(`upside-briefing-cc|${Math.round(openPrem)}|${Math.round(monthPrem)}`)
    );
    items.push({
      id: `cc-season-${dayKey}`,
      kind: "watch",
      title:
        monthPrem > 0
          ? `$${money(monthPrem)} premium booked this month`
          : `~$${money(openPrem)} open CC premium modeled`,
      detail:
        openPrem > 0
          ? pick(rng, [
              "When you actually fill a call, tap Log premium on the CC income tab so the season meter counts it.",
              "Modeled, not banked yet — log the fill when it actually happens so the season meter matches reality.",
            ])
          : pick(rng, [
              "Premium already logged in Cashflow — season meter is current.",
              "That's real, logged premium — the season meter already reflects it.",
            ]),
      link: { type: "lab", tab: "season" },
      cta: openPrem > 0 ? "Log premium →" : "CC income →",
    });
  }

  // Margin-in-play and concentration are Alerts conditions (see the pointer
  // card above) — dry powder isn't a warning, so it stays here as its own
  // narrative beat rather than living in Alerts.
  if (model.totals.cash > 5_000) {
    const rng = mulberry32(hashSeed(`upside-briefing-cash|${Math.round(model.totals.cash)}`));
    items.push({
      id: "dry-powder",
      kind: "watch",
      title: `$${money(model.totals.cash)} sitting in cash`,
      detail: pick(rng, [
        "Fine as powder. Only deploy on a real thesis dip — boredom isn’t a buy signal.",
        "Dry powder, not dead money — it's doing its job just by being ready.",
        "Sitting idle on purpose beats forcing a mediocre entry. Wait for the dip you actually want.",
      ]),
      link: sheetMostCash(model)
        ? { type: "sheet", portfolioId: sheetMostCash(model)! }
        : { type: "compound" },
      cta: sheetMostCash(model) ? "Open sheet →" : "Compound →",
    });
  }

  const plays: BriefingItem[] = [
    {
      id: `play-wait-${dayKey}`,
      kind: "play",
      title: "The job today is waiting",
      detail: "Own the names, write calls when it’s fat, otherwise close the laptop.",
    },
    {
      id: `play-versus-${dayKey}`,
      kind: "play",
      title: "Family scoreboard is live",
      detail: "Glance Versus if you want the family sheet rankings.",
      link: { type: "lab", tab: "versus" },
      cta: "Scoreboard →",
    },
  ];
  const play = plays[Math.abs(hash(dayKey)) % plays.length]!;
  items.push(play);

  const seen = new Set<string>();
  const out: BriefingItem[] = [];
  for (const kind of ["action", "watch", "play"] as const) {
    for (const it of items.filter((i) => i.kind === kind)) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
      if (out.length >= 5) return out;
    }
  }
  return out;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
