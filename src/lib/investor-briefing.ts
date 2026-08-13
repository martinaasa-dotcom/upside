import { cashtag } from "@/lib/format";
import type { CoveredCallRow } from "@/lib/types";
import type { OverviewModel } from "@/lib/overview";
import type { UpsideAlert } from "@/lib/alerts";
import { todayKeyInTz } from "@/lib/timezone";
import { hashSeed, mulberry32, pick } from "@/lib/seeded-rng";
import { buildPortfolioPersonality, THEME_LABEL } from "@/lib/portfolio-personality";
import { COMPOUND_MILESTONE_GOALS } from "@/lib/compound-play";

export type BriefingLink =
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
 * One rotating "what's the play today" card. Built from what this viewer
 * can actually reach, so a no-options novice never gets a covered-call
 * pep talk.
 */
function buildPlays(opts: {
  model: OverviewModel;
  dayKey: string;
  hideOptions: boolean;
}): BriefingItem[] {
  const { model, dayKey, hideOptions } = opts;
  const plays: BriefingItem[] = [];

  plays.push({
    id: `play-wait-${dayKey}`,
    kind: "play",
    title: "Most days, the job is just watching",
    detail:
      "Nothing here needs action right now. Checking in daily is the habit worth keeping. Trading daily isn't.",
  });

  if (!hideOptions) {
    plays.push({
      id: `play-cc-wait-${dayKey}`,
      kind: "play",
      title: "Hold, and only write when it's worth it",
      detail:
        "Own the shares. Sell a call only when the premium is actually rich enough to bother. Otherwise there's nothing to do today.",
    });
  }

  const equityHoldings = model.tickers
    .filter((t) => t.currentValue > 0)
    .map((t) => ({ ticker: t.ticker, value: t.currentValue }));
  if (equityHoldings.length > 0) {
    const personality = buildPortfolioPersonality(equityHoldings);
    const rng = mulberry32(
      hashSeed(`upside-briefing-theme|${dayKey}|${personality.dominantTheme}`)
    );
    plays.push({
      id: `play-theme-${dayKey}`,
      kind: "play",
      title: `Mostly ${THEME_LABEL[personality.dominantTheme]}, ${personality.diversificationBand.label.toLowerCase()}`,
      detail: pick(rng, [
        `${personality.diversificationBand.description} A playful read of the mix, not a forecast.`,
        `Theme mix leans ${THEME_LABEL[personality.dominantTheme].toLowerCase()}. Fun label, not a target.`,
      ]),
    });
  }

  const total = model.totals.totalValue;
  const next = COMPOUND_MILESTONE_GOALS.find((g) => total < g) ?? null;
  if (next != null && total > 0) {
    const remaining = next - total;
    const rng = mulberry32(hashSeed(`upside-briefing-milestone|${dayKey}|${next}`));
    plays.push({
      id: `play-milestone-${dayKey}`,
      kind: "play",
      title: `$${money(remaining)} to your next milestone`,
      detail: pick(rng, [
        `$${money(next)} is the next line on the ladder. No action needed, just time.`,
        `Crossing $${money(next)} doesn't need a trade, just patience.`,
      ]),
      link: { type: "compound" },
      cta: "See the ladder →",
    });
  }

  const topMover = [...model.tickers]
    .filter((t) => t.todayPct != null)
    .sort((a, b) => Math.abs(b.todayPct ?? 0) - Math.abs(a.todayPct ?? 0))[0];
  if (topMover && Math.abs(topMover.todayPct ?? 0) >= 0.02) {
    const pct = topMover.todayPct!;
    const rng = mulberry32(
      hashSeed(`upside-briefing-mover|${dayKey}|${cashtag(topMover.ticker)}`)
    );
    plays.push({
      id: `play-mover-${dayKey}`,
      kind: "play",
      title: `${cashtag(topMover.ticker)} is today's biggest mover, ${pct >= 0 ? "+" : ""}${pct1(pct)}`,
      detail: pick(rng, [
        "Worth knowing why before you assume it's noise.",
        "One name doing most of the day's talking. Worth a glance.",
      ]),
      ticker: topMover.ticker,
      link: topMover.portfolioIds[0]
        ? { type: "sheet", portfolioId: topMover.portfolioIds[0] }
        : undefined,
      cta: topMover.portfolioIds[0] ? "Open sheet →" : undefined,
    });
  }

  return plays;
}

/**
 * Daily glance: today's $, real alerts, then one play.
 * Pulse is a top-level tab, so the CTA follows `canReachPulse`, not Lab.
 */
export function buildInvestorBriefing(input: {
  model: OverviewModel;
  activeAlerts: UpsideAlert[];
  coveredCallRows: CoveredCallRow[];
  dayKey?: string;
  hideOptions?: boolean;
  canReachPulse?: boolean;
}): BriefingItem[] {
  const dayKey = input.dayKey ?? todayKeyInTz();
  const { model, activeAlerts, coveredCallRows } = input;
  const hideOptions = Boolean(input.hideOptions);
  const canReachPulse = input.canReachPulse ?? true;
  const items: BriefingItem[] = [];

  const today$ = model.totals.todayDollar;
  const todayPct = model.totals.todayPct;
  const dayRng = mulberry32(hashSeed(`upside-briefing-day|${dayKey}|${Math.round(today$)}`));
  const dayDetail =
    todayPct == null
      ? "Quotes still settling. Open, skim, close."
      : hideOptions
        ? pick(dayRng, [
            `${pct1(todayPct)} across the book. Check Pulse if a name moved enough to matter.`,
            `${pct1(todayPct)} on the session. Most days, watching is the job.`,
            `${pct1(todayPct)} today. Glance at Pulse if something looks off, otherwise close the tab.`,
          ])
        : pick(dayRng, [
            `${pct1(todayPct)} across the book. If nothing needs a write-plan tweak, waiting is the job.`,
            `${pct1(todayPct)} on the session. Nothing to do unless a write plan actually needs one.`,
            `${pct1(todayPct)} today. Check Thesis Pulse if anything moved enough to matter, otherwise it's a nothing-burger day.`,
          ]);
  items.push({
    id: `day-${dayKey}`,
    kind: "watch",
    title: `Book is ${dayMoney(today$)} on the day`,
    detail: dayDetail,
    link: canReachPulse ? { type: "pulse" } : undefined,
    cta: canReachPulse ? "Thesis pulse →" : undefined,
  });

  for (const alert of activeAlerts.slice(0, 3)) {
    items.push({
      id: `alert-${alert.id}`,
      kind: "action",
      title: alert.title,
      detail: alert.detail,
      ticker: alert.ticker,
    });
  }

  if (!hideOptions) {
    const openPrem = coveredCallRows.reduce((s, r) => s + (r.premium ?? 0), 0);
    if (openPrem > 0) {
      const rng = mulberry32(
        hashSeed(`upside-briefing-cc|${Math.round(openPrem)}`)
      );
      items.push({
        id: `cc-season-${dayKey}`,
        kind: "watch",
        title: `~$${money(openPrem)} open CC premium modeled`,
        detail: pick(rng, [
          "Modeled on your current strikes, not money in the account yet.",
          "That's what the open calls are worth on paper if they run to expiry.",
        ]),
      });
    }
  }

  if (model.totals.cash > 5_000) {
    const rng = mulberry32(hashSeed(`upside-briefing-cash|${Math.round(model.totals.cash)}`));
    items.push({
      id: "dry-powder",
      kind: "watch",
      title: `$${money(model.totals.cash)} sitting in cash`,
      detail: pick(rng, [
        "Fine as powder. Only use it on a real thesis dip. Boredom isn't a buy signal.",
        "Dry powder, not dead money. It's doing its job just by being ready.",
        "Sitting idle on purpose beats forcing a mediocre entry. Wait for the dip you actually want.",
      ]),
      link: sheetMostCash(model)
        ? { type: "sheet", portfolioId: sheetMostCash(model)! }
        : { type: "compound" },
      cta: sheetMostCash(model) ? "Open sheet →" : "Compound →",
    });
  }

  const plays = buildPlays({ model, dayKey, hideOptions });
  if (plays.length > 0) {
    items.push(plays[Math.abs(hash(dayKey)) % plays.length]!);
  }

  const seen = new Set<string>();
  const out: BriefingItem[] = [];
  for (const kind of ["action", "watch", "play"] as const) {
    for (const it of items.filter((i) => i.kind === kind)) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
      if (out.length >= 6) return out;
    }
  }
  return out;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
