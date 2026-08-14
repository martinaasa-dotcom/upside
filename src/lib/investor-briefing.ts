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
  action: "Look at this",
  watch: "Note",
  play: "A thought",
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
 * One rotating "what's the play today" card. Options pep talks live
 * elsewhere (strike alerts, covered-call panel) so this pool stays
 * about the book, not about writing calls.
 */
function buildPlays(opts: {
  model: OverviewModel;
  dayKey: string;
}): BriefingItem[] {
  const { model, dayKey } = opts;
  const plays: BriefingItem[] = [];

  plays.push({
    id: `play-wait-${dayKey}`,
    kind: "play",
    title: "Nothing to do today",
    detail: "No trades needed. Checking in is enough.",
  });

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
        `${personality.diversificationBand.description} That's the mix, not a prediction.`,
        `Mostly ${THEME_LABEL[personality.dominantTheme].toLowerCase()}. Just a read on how the book is built.`,
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
        `$${money(next)} is next. Time gets you there, not a trade.`,
        `$${money(remaining)} to go. No hurry.`,
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
        "Look at why before you shrug it off.",
        "That's the name making noise today.",
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
  // Hide unless the caller explicitly opted the viewer in. Forgetting to
  // pass this used to leak covered-call pep talks onto Home.
  const hideOptions = input.hideOptions !== false;
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
          ? "Normal day"
          : today$ >= 0
            ? "Big day, in your favour"
            : "Rough day";
  const dayDetail =
    todayPct == null
      ? "Quotes are still settling. Give it a minute, or come back later."
      : swing! < 0.005
        ? "Barely moved. Most days look like this."
        : swing! < 0.02
          ? pick(dayRng, [
              "A normal wobble. You don't need to do anything.",
              "Small moves. Don't turn them into a decision.",
            ])
          : hideOptions
            ? pick(dayRng, [
                "A move this size is usually one name. Pulse will show which.",
                "Big enough to check. Did the story change, or just the price?",
              ])
            : pick(dayRng, [
                "A move this size is usually one name. Pulse will show which.",
                "Big enough to check. If a call plan needs adjusting, it would be today.",
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
          "From the strikes you set. Not in the account yet.",
          "What those calls would be worth at expiry. On paper, not banked.",
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
        "Fine sitting there. Don't buy just because you're bored.",
        "Keep it until you actually want the dip.",
        "Ready when you are. Spending it because it's there is how cash becomes a bad position.",
      ]),
      link: sheetMostCash(model)
        ? { type: "sheet", portfolioId: sheetMostCash(model)! }
        : { type: "compound" },
      cta: sheetMostCash(model) ? "Open this sheet" : "Open Compound",
    });
  }

  const plays = buildPlays({ model, dayKey }).filter((p) =>
    activeAlerts.length > 0 ? p.id !== `play-wait-${dayKey}` : true
  );
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
