import { cashtag } from "@/lib/format";
import type { CoveredCallRow } from "@/lib/types";
import type { OverviewModel } from "@/lib/overview";
import type { CashflowEntry } from "@/lib/cashflow";
import type { UpsideAlert } from "@/lib/alerts";
import { todayKeyInTz } from "@/lib/timezone";
import { hashSeed, mulberry32, pick } from "@/lib/seeded-rng";
import { buildPortfolioPersonality, THEME_LABEL } from "@/lib/portfolio-personality";
import { COMPOUND_MILESTONE_GOALS } from "@/lib/compound-play";
import { loadLastTradeTimestamp } from "@/lib/inaction-dividend";

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
 * Rotating "what's the play today" card — one per day, deterministic per
 * dayKey. The pool is built fresh from whatever's actually eligible (has
 * options experience? can reach Lab? is there a real mover today?) instead
 * of a fixed 2-item list, so novices and no-options viewers never see a
 * play that references a hidden feature or covered-call mechanics, and
 * everyone else gets real variety instead of a coin flip between two
 * options.
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
      "Nothing here needs action right now. Checking in daily is the habit worth keeping, trading daily isn't.",
  });

  const lastTradeTime = loadLastTradeTimestamp();
  const daysPatience = Math.max(1, Math.floor((Date.now() - lastTradeTime) / 86400000));
  if (daysPatience >= 7) {
    plays.push({
      id: `play-patience-${dayKey}`,
      kind: "play",
      title: `${daysPatience} days of holding discipline`,
      detail:
        "Compounding works best with zero unforced errors. Holding your conviction through noise is the real alpha.",
    });
  }

  if (!hideOptions) {
    plays.push({
      id: `play-cc-wait-${dayKey}`,
      kind: "play",
      title: "Hold, and only write when it's worth it",
      detail:
        "Own the shares. Sell a call only when the premium's actually rich enough to bother. Otherwise there's nothing to do today.",
    });
  }

  // Dominant-theme / concentration read — genuinely different per person,
  // reuses the same engine as Communities' "power animal" scoring.
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
      title: `${personality.animalEmoji} Mostly ${THEME_LABEL[personality.dominantTheme]}, ${personality.diversificationBand.label.toLowerCase()}`,
      detail: pick(rng, [
        `${personality.diversificationBand.description} Risk read: ${personality.riskBand.label.toLowerCase()}.`,
        `That's ${personality.animal} energy: ${personality.riskBand.description.toLowerCase()}`,
      ]),
    });
  }

  // Milestone proximity — same ladder Compound uses, framed as a patience
  // reminder rather than a goal to chase.
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

  // Today's biggest real mover — only when it's a genuine move, not noise.
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
 *
 * `hideOptions` hard-removes covered-call content (not just de-emphasizes
 * it), matching the same rule used everywhere else options are gated.
 * `canReachLab` should be false whenever the viewer's experience tier
 * hides the Lab meta-tab (novice) — plays that name Lab-only features are
 * dropped from the rotation instead of pointing at something that isn't
 * there for them to click.
 */
export function buildInvestorBriefing(input: {
  model: OverviewModel;
  activeAlerts: UpsideAlert[];
  coveredCallRows: CoveredCallRow[];
  cashflows: CashflowEntry[];
  dayKey?: string;
  hideOptions?: boolean;
  canReachLab?: boolean;
}): BriefingItem[] {
  const dayKey = input.dayKey ?? todayKeyInTz();
  const { model, activeAlerts, coveredCallRows } = input;
  const hideOptions = Boolean(input.hideOptions);
  const canReachLab = input.canReachLab ?? true;
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
        : "Quotes still settling. Open, skim, close.",
    // Pulse lives inside Lab now, so the CTA is only offered to viewers
    // who can actually reach Lab.
    link: canReachLab ? { type: "pulse" } : undefined,
    cta: canReachLab ? "Thesis pulse →" : undefined,
  });

  // Lab's Alerts tab is gone, so this card is the only place earnings,
  // strike, margin and concentration warnings surface. It carries the
  // detail inline and is shown to everyone rather than being gated on
  // reaching Lab, which would have hidden alerts from novices entirely.
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
    });
  }

  // Open covered-call premium, as a plain read. The nudge to "log the
  // fill" that used to live here pointed at Lab's CC income and Cashflow
  // tabs, both of which are gone, so there is nowhere to log a premium and
  // no honest CTA to offer.
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
        "Fine as powder. Only deploy on a real thesis dip, boredom isn't a buy signal.",
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
