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
 * Daily investor briefing — narrative habit loop.
 * Per-ticker strike/earnings alerts live in Lab → Digest (dismissible queue).
 * Briefing stays high-level so the same signal isn’t written twice.
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
        ? `${pct1(todayPct)} combined · skim Digest if anything’s loud, otherwise wait.`
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
        ? `Earnings day — ${names.join(", ")}`
        : `${soonEarn.length} earnings in the next week`,
      detail: `${names.join(", ")}${soonEarn.length > names.length ? "…" : ""}. Queue lives in Lab → Digest — prefer expire-before if writing.`,
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
          ? `${names[0]} needs a write-plan look`
          : `${hotStrikes.length} names near strike / through target`,
      detail: `${names.join(", ")}. Dismissible cards are in Digest — Margus is for the roll/widen call.`,
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
        openPrem > 0 && monthPrem > 0
          ? `~$${money(openPrem)} still open on the calendar — log fills from CC calendar to close the season loop.`
          : "One-tap Log premium on the CC calendar when you fill — season meter moves.",
    });
  }

  if (model.totals.cash < -500) {
    items.push({
      id: "margin",
      kind: "watch",
      title: "Margin is live",
      detail: `Combined cash $${money(model.totals.cash)}. Keep utilization intentional — hard ceiling ~30%.`,
    });
  } else if (model.totals.cash > 5_000) {
    items.push({
      id: "dry-powder",
      kind: "watch",
      title: "Dry powder sitting",
      detail: `$${money(model.totals.cash)} idle. Only deploy on thesis dips — boredom is not a signal.`,
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
        detail:
          "Fine when the thesis is — know the blast radius. Detail cards stay in Digest.",
        ticker: top.ticker,
      });
    }
  }

  const plays: BriefingItem[] = [
    {
      id: `play-wait-${dayKey}`,
      kind: "play",
      title: "The job today is waiting",
      detail:
        "Own + write calls + wait. Skim this briefing, maybe poke Arena — leave the real book alone.",
    },
    {
      id: `play-arena-${dayKey}`,
      kind: "play",
      title: "Boredom mode: Daily Arena",
      detail:
        "Sandbox only, live-book tickers. Overview card deep-links — trash-talk Versus if you must.",
    },
    {
      id: `play-versus-${dayKey}`,
      kind: "play",
      title: "Who’s house leader?",
      detail:
        "One Overview card ranks the family board. Versus is for the full roast.",
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
