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

/** Plain-English labels. "action/watch/play" are codes, not UI. */
export const BRIEFING_KIND_LABEL: Record<BriefingItem["kind"], string> = {
  action: "Needs a look",
  watch: "Worth knowing",
  play: "Something to sit with",
};

export const BRIEFING_PULSE_CTA = "Open Pulse";

function pct1(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

function money(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function sheetMostCash(model: OverviewModel): string | undefined {
  const sorted = [...model.sheets].sort(
    (a, b) => b.portfolio.cash_balance - a.portfolio.cash_balance
  );
  return sorted[0]?.portfolio.id;
}

/** Which sheet actually holds the covered-call premium being modeled, so
 * the briefing card can take the viewer straight to it instead of just
 * quoting a book-wide number with nowhere to go. */
function sheetMostCcPremium(rows: CoveredCallRow[]): string | undefined {
  const byPortfolio = new Map<string, number>();
  for (const r of rows) {
    const id = r.holding.portfolio_id;
    if (!id) continue;
    byPortfolio.set(id, (byPortfolio.get(id) ?? 0) + (r.premium ?? 0));
  }
  let best: string | undefined;
  let bestPremium = -Infinity;
  for (const [id, premium] of byPortfolio) {
    if (premium > bestPremium) {
      bestPremium = premium;
      best = id;
    }
  }
  return best;
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
      cta: "Open Compound",
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
      cta: topMover.portfolioIds[0] ? "Open this sheet" : undefined,
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
  const dayRng = mulberry32(
    hashSeed(`upside-briefing-day|${dayKey}|${Math.round(today$)}`)
  );

  // Deliberately does NOT restate today's dollar figure. It's already the
  // second cell of the scoreboard directly above this card, and before
  // this the same number appeared three times on one screen. What a
  // briefing owes you is the read on the number, not the number again.
  const swing = todayPct == null ? null : Math.abs(todayPct);
  const dayTitle =
    todayPct == null
      ? "Prices are still coming in"
      : swing! < 0.005
        ? "Quiet day"
        : swing! < 0.02
          ? "Normal day, nothing unusual"
          : today$ >= 0
            ? "Big day, in your favour"
            : "Rough day";
  const dayDetail =
    todayPct == null
      ? "Quotes are still settling. Give it a minute, or just come back later."
      : swing! < 0.005
        ? "Barely moved. Days like this are most of them, and they're the point."
        : swing! < 0.02
          ? pick(dayRng, [
              "Inside the range a book like yours moves on any given day. Nothing to react to.",
              "This is ordinary noise, not information. Watching is the whole job today.",
            ])
          : hideOptions
            ? pick(dayRng, [
                "A move this size usually has one name behind it. Worth finding out which, and why.",
                "Big enough to be worth a look. Check whether the story changed or just the price.",
              ])
            : pick(dayRng, [
                "A move this size usually has one name behind it. Worth finding out which, and why.",
                "Big enough to check on. If a call plan needs adjusting, today's the day it would.",
              ]);

  items.push({
    id: `day-${dayKey}`,
    kind: "watch",
    title: dayTitle,
    detail: dayDetail,
    link: canReachPulse ? { type: "pulse" } : undefined,
    cta: canReachPulse ? BRIEFING_PULSE_CTA : undefined,
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
      const ccSheetId = sheetMostCcPremium(coveredCallRows);
      items.push({
        id: `cc-season-${dayKey}`,
        kind: "watch",
        title: `About $${money(openPrem)} in call premium on paper`,
        detail: pick(rng, [
          "Estimated from the strikes you've set. It isn't money in your account yet.",
          "What your open calls would be worth if they ran to expiry. On paper, not banked.",
        ]),
        link: ccSheetId ? { type: "sheet", portfolioId: ccSheetId } : undefined,
        cta: ccSheetId ? "Open covered calls" : undefined,
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
        "Nothing wrong with that. Cash is doing its job by being ready. Boredom isn't a buy signal.",
        "Idle on purpose beats forcing a mediocre entry. Wait for the dip you actually wanted.",
        "It's ready when you are. Spending it because it's there is how good cash turns into a bad position.",
      ]),
      link: sheetMostCash(model)
        ? { type: "sheet", portfolioId: sheetMostCash(model)! }
        : { type: "compound" },
      cta: sheetMostCash(model) ? "Open this sheet" : "Open Compound",
    });
  }

  const plays = buildPlays({ model, dayKey, hideOptions });
  if (plays.length > 0) {
    items.push(plays[Math.abs(hash(dayKey)) % plays.length]!);
  }

  // Four, not six. Six stacked cards under a scoreboard is a feed, and a
  // feed is the thing you scroll past. A briefing you actually read has to
  // fit on one screen with the numbers it's explaining.
  const seen = new Set<string>();
  const out: BriefingItem[] = [];
  for (const kind of ["action", "watch", "play"] as const) {
    for (const it of items.filter((i) => i.kind === kind)) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
      if (out.length >= 4) return out;
    }
  }
  return out;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
