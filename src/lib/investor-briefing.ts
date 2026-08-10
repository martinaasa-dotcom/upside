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

/**
 * Daily investor briefing — actionable + one playful beat.
 * Seeded by Tallinn day so the set feels fresh without streaks/XP.
 */
export function buildInvestorBriefing(input: {
  model: OverviewModel;
  earnings: EarningsLike[];
  coveredCallRows: CoveredCallRow[];
  cashflows: CashflowEntry[];
  dayKey?: string;
}): BriefingItem[] {
  const dayKey = input.dayKey ?? todayKeyInTz();
  const { model, earnings, coveredCallRows } = input;
  const items: BriefingItem[] = [];

  const soonEarn = [...earnings]
    .filter((e) => e.days >= 0 && e.days <= 7)
    .sort((a, b) => a.days - b.days);
  for (const e of soonEarn.slice(0, 2)) {
    items.push({
      id: `earn-${e.ticker}-${e.date}`,
      kind: "action",
      title:
        e.days === 0
          ? `${e.ticker} reports today`
          : e.days === 1
            ? `${e.ticker} reports tomorrow`
            : `${e.ticker} earnings in ${e.days}d`,
      detail:
        e.days <= 2
          ? "Prefer expire-before if writing calls — or sit out the front week."
          : `Dated ${e.date}. Sketch the CC plan before the print.`,
      ticker: e.ticker,
    });
  }

  for (const r of coveredCallRows) {
    const spot = r.spot;
    const strike = r.nextStrike;
    if (spot == null || !(spot > 0) || strike == null || !(strike > 0)) continue;
    const ratio = spot / strike;
    if (ratio >= 0.98) {
      items.push({
        id: `strike-${r.holding.id}`,
        kind: "action",
        title: `${r.holding.ticker} hugging Next Strike`,
        detail: `Spot ${money(spot)} vs strike ${money(strike)} (${pct1(ratio - 1)} to call). Roll, take assignment, or widen.`,
        ticker: r.holding.ticker,
      });
    } else if (r.stockTarget != null && spot >= r.stockTarget) {
      items.push({
        id: `target-${r.holding.id}`,
        kind: "action",
        title: `${r.holding.ticker} through Stock Target`,
        detail: `Spot cleared ${money(r.stockTarget)} — refresh the write level.`,
        ticker: r.holding.ticker,
      });
    }
  }

  if (model.totals.cash < -500) {
    items.push({
      id: "margin",
      kind: "watch",
      title: "Margin is live",
      detail: `Combined cash ${money(model.totals.cash)}. Keep utilization intentional — hard ceiling ~30%.`,
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
        detail: "Concentration is fine when the thesis is — just know the blast radius.",
        ticker: top.ticker,
      });
    }
  }

  const dayChamp = [...model.tickers]
    .filter((t) => t.todayPct != null)
    .sort((a, b) => Math.abs(b.todayPct ?? 0) - Math.abs(a.todayPct ?? 0))[0];
  if (dayChamp && Math.abs(dayChamp.todayPct ?? 0) >= 0.02) {
    items.push({
      id: `move-${dayChamp.ticker}`,
      kind: "watch",
      title: `${dayChamp.ticker} is the loudest move (${pct1(dayChamp.todayPct!)})`,
      detail:
        (dayChamp.todayPct ?? 0) > 0
          ? "Green day — if you write calls, this is usually the window."
          : "Red day — don’t dump strikes into weakness unless the thesis broke.",
      ticker: dayChamp.ticker,
    });
  }

  const openPrem = coveredCallRows.reduce((s, r) => s + (r.premium ?? 0), 0);
  if (openPrem > 0) {
    items.push({
      id: "cc-open",
      kind: "action",
      title: `~$${money(openPrem)} open CC premium modeled`,
      detail: "Check Lab → Income for the season meter and next expiries.",
    });
  }

  // Always end with one playful / boredom-mode beat
  const plays: BriefingItem[] = [
    {
      id: `play-arena-${dayKey}`,
      kind: "play",
      title: "Boredom mode: Paper Arena",
      detail:
        "Daily challenge uses live-book tickers only. Trade the sandbox — leave the real book alone.",
    },
    {
      id: `play-versus-${dayKey}`,
      kind: "play",
      title: "Family scoreboard is live",
      detail: "Lab → Versus ranks sheets on today, ROI, and NAV. Trash talk optional.",
    },
    {
      id: `play-wait-${dayKey}`,
      kind: "play",
      title: "The job today is waiting",
      detail:
        "Owning is the product. Open Upside, skim this briefing, close the laptop.",
    },
  ];
  const play = plays[Math.abs(hash(dayKey)) % plays.length]!;
  items.push(play);

  // Dedupe by id, prefer actions, cap at ~6
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
