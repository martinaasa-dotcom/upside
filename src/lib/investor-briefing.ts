import type { CoveredCallRow } from "@/lib/types";
import type { OverviewModel } from "@/lib/overview";
import type { CashflowEntry } from "@/lib/cashflow";
import { todayKeyInTz } from "@/lib/timezone";

export type BriefingItem = {
  id: string;
  kind: "action" | "watch" | "play";
  title: string;
  detail: string;
  ticker?: string;
};

type EarningsLike = { ticker: string; date: string; days: number };

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

/**
 * Daily investor briefing — what to know when you open Upside.
 * Speaks in plain English. Per-ticker to-dos live under Alerts (Lab).
 */
export function buildInvestorBriefing(input: {
  model: OverviewModel;
  earnings: EarningsLike[];
  coveredCallRows: CoveredCallRow[];
  cashflows: CashflowEntry[];
  dayKey?: string;
}): BriefingItem[] {
  const dayKey = input.dayKey ?? todayKeyInTz();
  const { model, earnings, coveredCallRows, cashflows } = input;
  const items: BriefingItem[] = [];

  const today$ = model.totals.todayDollar;
  const todayPct = model.totals.todayPct;
  items.push({
    id: `day-${dayKey}`,
    kind: "watch",
    title: `Book is ${dayMoney(today$)} on the day`,
    detail:
      todayPct != null
        ? `${pct1(todayPct)} across the book. If nothing needs a write-plan tweak, waiting is the job.`
        : "Quotes still settling — open, skim, close.",
  });

  const soonEarn = earnings.filter((e) => e.days >= 0 && e.days <= 7);
  if (soonEarn.length > 0) {
    const names = [...new Set(soonEarn.map((e) => e.ticker))].slice(0, 4);
    const todayPrint = soonEarn.some((e) => e.days === 0);
    items.push({
      id: `earn-week-${dayKey}`,
      kind: "action",
      title: todayPrint
        ? `Earnings today — ${names.join(", ")}`
        : `${soonEarn.length} earnings in the next week`,
      detail: `${names.join(", ")}${soonEarn.length > names.length ? "…" : ""}. If you’re writing calls, prefer expiries that finish before the print.`,
    });
  }

  const hotStrikes = coveredCallRows.filter((r) => {
    const spot = r.spot;
    const strike = r.nextStrike;
    if (spot == null || !(spot > 0) || strike == null || !(strike > 0))
      return false;
    return (
      spot / strike >= 0.98 ||
      (r.stockTarget != null && spot >= r.stockTarget)
    );
  });
  if (hotStrikes.length > 0) {
    const names = [
      ...new Set(hotStrikes.map((r) => r.holding.ticker)),
    ].slice(0, 4);
    items.push({
      id: `strikes-${dayKey}`,
      kind: "action",
      title:
        hotStrikes.length === 1
          ? `${names[0]} is hugging the call strike`
          : `${hotStrikes.length} names near strike or through target`,
      detail: `${names.join(", ")}. Decide: roll, widen, or take assignment — ask Margus if you want a write plan.`,
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
    items.push({
      id: `cc-season-${dayKey}`,
      kind: "watch",
      title:
        monthPrem > 0
          ? `$${money(monthPrem)} premium booked this month`
          : `~$${money(openPrem)} open CC premium modeled`,
      detail:
        openPrem > 0
          ? "When you actually fill a call, tap Log premium on the CC calendar so the season meter counts it."
          : "Premium already logged in Cashflow — season meter is current.",
    });
  }

  if (model.totals.cash < -500) {
    items.push({
      id: "margin",
      kind: "watch",
      title: "Margin is live",
      detail: `Combined cash $${money(model.totals.cash)}. Keep it intentional — soft ceiling ~30% of the book.`,
    });
  } else if (model.totals.cash > 5_000) {
    items.push({
      id: "dry-powder",
      kind: "watch",
      title: `$${money(model.totals.cash)} sitting in cash`,
      detail: "Fine as powder. Only deploy on a real thesis dip — boredom isn’t a buy signal.",
    });
  }

  const top = [...model.tickers].sort(
    (a, b) => b.currentValue - a.currentValue
  )[0];
  if (top && model.totals.equityValue > 0) {
    const share = top.currentValue / model.totals.equityValue;
    if (share >= 0.35) {
      items.push({
        id: `conc-${top.ticker}`,
        kind: "watch",
        title: `${top.ticker} is ${pct1(share)} of equity`,
        detail: "Concentration is fine when the thesis is — just know the blast radius if it hiccups.",
        ticker: top.ticker,
      });
    }
  }

  const plays: BriefingItem[] = [
    {
      id: `play-wait-${dayKey}`,
      kind: "play",
      title: "The job today is waiting",
      detail: "Own the names, write calls when it’s fat, otherwise close the laptop.",
    },
    {
      id: `play-arena-${dayKey}`,
      kind: "play",
      title: "Bored? Paper Arena",
      detail: "Sandbox money only — trade the itch without touching the real book.",
    },
    {
      id: `play-versus-${dayKey}`,
      kind: "play",
      title: "House leader is on the board",
      detail: "Glance Versus if you want the family scoreboard roast.",
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
