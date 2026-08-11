import type { CoveredCallRow } from "@/lib/types";
import type { OverviewModel } from "@/lib/overview";
import type { CashflowEntry } from "@/lib/cashflow";
import { todayKeyInTz } from "@/lib/timezone";
import { hashSeed, mulberry32, pick } from "@/lib/seeded-rng";

export type BriefingLink =
  | { type: "lab"; tab: "calendar" | "alerts" | "arena" | "versus" | "season" }
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

/** User logged a fill — only then talk roll / assignment. */
function hasRecentPremiumLog(
  cashflows: CashflowEntry[],
  ticker: string,
  withinDays = 60
): boolean {
  const cut = Date.now() - withinDays * 86400000;
  const key = ticker.toUpperCase();
  return cashflows.some(
    (c) =>
      c.kind === "premium" &&
      c.ticker?.toUpperCase() === key &&
      new Date(c.at).getTime() >= cut
  );
}

function sheetForTicker(
  model: OverviewModel,
  ticker: string
): string | undefined {
  return model.tickers.find((t) => t.ticker === ticker)?.portfolioIds[0];
}

function sheetMostNegativeCash(model: OverviewModel): string | undefined {
  const sorted = [...model.sheets].sort(
    (a, b) => a.portfolio.cash_balance - b.portfolio.cash_balance
  );
  return sorted[0]?.portfolio.id;
}

function sheetMostCash(model: OverviewModel): string | undefined {
  const sorted = [...model.sheets].sort(
    (a, b) => b.portfolio.cash_balance - a.portfolio.cash_balance
  );
  return sorted[0]?.portfolio.id;
}

function earningsBriefDetail(
  names: string[],
  coveredCallRows: CoveredCallRow[],
  cashflows: CashflowEntry[]
): string {
  const withCc = names.filter(
    (t) =>
      coveredCallRows.some(
        (r) =>
          r.holding.ticker === t &&
          r.contracts > 0 &&
          (hasRecentPremiumLog(cashflows, t) ||
            (r.premium != null && r.expiration))
      )
  );
  const base = names.join(", ");
  const rng = mulberry32(hashSeed(`upside-briefing-earn|${names.join(",")}`));
  if (withCc.length > 0) {
    return pick(rng, [
      `${base}. ${withCc.join(", ")} — you have CC on the book; earnings vol can help or hurt depending on gap vs strike.`,
      `${base}. Live calls on ${withCc.join(", ")} ride into the print — a gap past strike means an early assignment call, not a surprise.`,
    ]);
  }
  return pick(rng, [
    `${base}. Vol often expands into the print — writing CC into earnings can be the play if you want premium and accept gap risk. Check each sheet’s CC table for strikes.`,
    `${base}. No open calls riding into this one. Premium runs rich pre-print if you want to write; otherwise just watch the gap.`,
  ]);
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

  const soonEarn = earnings.filter((e) => e.days >= 0 && e.days <= 7);
  if (soonEarn.length > 0) {
    const names = [...new Set(soonEarn.map((e) => e.ticker))].slice(0, 4);
    const todayPrint = soonEarn.some((e) => e.days === 0);
    items.push({
      id: `earn-week-${dayKey}`,
      kind: "watch",
      title: todayPrint
        ? `Earnings today — ${names.join(", ")}`
        : `${soonEarn.length} earnings in the next week`,
      detail: earningsBriefDetail(names, coveredCallRows, cashflows),
      link: { type: "lab", tab: "calendar" },
      cta: "CC calendar →",
    });
  }

  // Spot vs write plan — only treat as an open CC if premium was logged
  const nearWritePlan = coveredCallRows.filter((r) => {
    const spot = r.spot;
    if (spot == null || !(spot > 0)) return false;
    const atTarget =
      r.stockTarget != null && spot >= r.stockTarget * 0.98;
    const atStrike =
      r.nextStrike != null &&
      r.nextStrike > 0 &&
      spot / r.nextStrike >= 0.98;
    return atTarget || atStrike;
  });

  const openCcNear = nearWritePlan.filter((r) =>
    hasRecentPremiumLog(cashflows, r.holding.ticker)
  );
  const planOnlyNear = nearWritePlan.filter(
    (r) => !hasRecentPremiumLog(cashflows, r.holding.ticker)
  );

  if (openCcNear.length > 0) {
    const lines = openCcNear.slice(0, 3).map((r) => {
      const strike = r.nextStrike;
      const exp = r.expiration ? ` · exp ${r.expiration}` : "";
      return strike != null
        ? `${r.holding.ticker} ~$${Math.round(strike)}${exp}`
        : r.holding.ticker;
    });
    items.push({
      id: `strikes-open-${dayKey}`,
      kind: "action",
      title:
        openCcNear.length === 1
          ? `${openCcNear[0]!.holding.ticker} near your logged call`
          : `${openCcNear.length} names near logged call strikes`,
      detail: `${lines.join(" · ")}. You logged premium — worth a roll / hold / assignment call on the sheet.`,
      ticker: openCcNear[0]?.holding.ticker,
      link: { type: "lab", tab: "calendar" },
      cta: "Review calls →",
    });
  }

  if (planOnlyNear.length > 0 && openCcNear.length === 0) {
    const names = [
      ...new Set(planOnlyNear.map((r) => r.holding.ticker)),
    ].slice(0, 3);
    items.push({
      id: `write-level-${dayKey}`,
      kind: "watch",
      title:
        planOnlyNear.length === 1
          ? `${names[0]} at your sheet write level`
          : `${names.length} names at Stock Target / planned strike`,
      detail: `${names.join(", ")} — spot is at the level your CC table targets, not a confirmed open call. Open the sheet CC row (or ask Margus there) before acting.`,
      ticker: names[0],
      link:
        names[0] && sheetForTicker(model, names[0])
          ? { type: "sheet", portfolioId: sheetForTicker(model, names[0])! }
          : { type: "lab", tab: "calendar" },
      cta: names[0] ? `Open ${names[0]} →` : "CC calendar →",
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
              "When you actually fill a call, tap Log premium on the CC calendar so the season meter counts it.",
              "Modeled, not banked yet — log the fill when it actually happens so the season meter matches reality.",
            ])
          : pick(rng, [
              "Premium already logged in Cashflow — season meter is current.",
              "That's real, logged premium — the season meter already reflects it.",
            ]),
      link: { type: "lab", tab: "calendar" },
      cta: openPrem > 0 ? "Log premium →" : "CC calendar →",
    });
  }

  if (model.totals.cash < -500) {
    const rng = mulberry32(hashSeed(`upside-briefing-margin|${Math.round(model.totals.cash)}`));
    items.push({
      id: "margin",
      kind: "watch",
      title: "Margin is live",
      detail: pick(rng, [
        `Combined cash $${money(model.totals.cash)}. Keep it intentional — soft ceiling ~30% of the book.`,
        `You're borrowing $${money(Math.abs(model.totals.cash))} from the broker right now. Fine on purpose, risky by accident.`,
      ]),
      link: sheetMostNegativeCash(model)
        ? { type: "sheet", portfolioId: sheetMostNegativeCash(model)! }
        : undefined,
      cta: "Open sheet →",
    });
  } else if (model.totals.cash > 5_000) {
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

  const top = [...model.tickers].sort(
    (a, b) => b.currentValue - a.currentValue
  )[0];
  if (top && model.totals.equityValue > 0) {
    const share = top.currentValue / model.totals.equityValue;
    if (share >= 0.35) {
      const rng = mulberry32(hashSeed(`upside-briefing-conc|${top.ticker}`));
      items.push({
        id: `conc-${top.ticker}`,
        kind: "watch",
        title: `${top.ticker} is ${pct1(share)} of equity`,
        detail: pick(rng, [
          "Concentration is fine when the thesis is — just know the blast radius if it hiccups.",
          `A big move in ${top.ticker} alone moves the whole book. That's the deal you signed up for.`,
        ]),
        ticker: top.ticker,
        link: sheetForTicker(model, top.ticker)
          ? { type: "sheet", portfolioId: sheetForTicker(model, top.ticker)! }
          : { type: "pulse" },
        cta: sheetForTicker(model, top.ticker)
          ? `Open ${top.ticker} →`
          : "Thesis pulse →",
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
      link: { type: "lab", tab: "arena" },
      cta: "Open Arena →",
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
