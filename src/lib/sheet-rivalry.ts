import type { OverviewModel, SheetScore } from "@/lib/overview";

export type RivalRow = {
  id: string;
  name: string;
  value: number;
  roiPct: number;
  todayDollar: number;
  todayPct: number | null;
  holdingCount: number;
  cash: number;
  /** Composite rivalry score (higher = winning the week vibe) */
  score: number;
  medals: { today: number; roi: number; nav: number };
};

function rankMap(
  sheets: SheetScore[],
  metric: (s: SheetScore) => number,
  desc = true
): Map<string, number> {
  const sorted = [...sheets].sort((a, b) =>
    desc ? metric(b) - metric(a) : metric(a) - metric(b)
  );
  const map = new Map<string, number>();
  sorted.forEach((s, i) => map.set(s.portfolio.id, i + 1));
  return map;
}

/** Family rivalry scoreboard — ranks sheets, not a limp A/B diff. */
export function buildSheetRivalry(model: OverviewModel): RivalRow[] {
  const sheets = model.sheets;
  if (!sheets.length) return [];

  const todayR = rankMap(sheets, (s) => s.todayDollar);
  const roiR = rankMap(sheets, (s) => s.roiPct);
  const navR = rankMap(sheets, (s) => s.totalValue);

  const n = sheets.length;
  const rows: RivalRow[] = sheets.map((s) => {
    const mt = todayR.get(s.portfolio.id) ?? n;
    const mr = roiR.get(s.portfolio.id) ?? n;
    const mn = navR.get(s.portfolio.id) ?? n;
    // Lower rank = better; invert to points
    const score = (n - mt + 1) * 3 + (n - mr + 1) * 2 + (n - mn + 1);
    return {
      id: s.portfolio.id,
      name: s.portfolio.name,
      value: s.totalValue,
      roiPct: s.roiPct,
      todayDollar: s.todayDollar,
      todayPct: s.todayPct,
      holdingCount: s.holdingCount,
      cash: s.portfolio.cash_balance,
      score,
      medals: { today: mt, roi: mr, nav: mn },
    };
  });

  return rows.sort((a, b) => b.score - a.score || b.todayDollar - a.todayDollar);
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

/** Plain-English copy for Overview card — not “house board / NAV medals”. */
export function rivalryOverviewCopy(
  leader: RivalRow | undefined,
  sheetCount: number
): { eyebrow: string; name: string; detail: string; ranks: string } {
  if (!leader || sheetCount === 0) {
    return {
      eyebrow: "Family scoreboard",
      name: "—",
      detail: "Compare your portfolios — who's up today, lifetime, and by book size.",
      ranks: "",
    };
  }
  const { today, roi, nav } = leader.medals;
  return {
    eyebrow: "Family scoreboard",
    name: leader.name,
    detail: `Ranks your sheets against each other (${sheetCount} total). ${leader.name} is ahead on the blended score — not always #1 in every column.`,
    ranks: `Today ${ordinal(today)} · Lifetime ${ordinal(roi)} · Book size ${ordinal(nav)}`,
  };
}

/** Lab Versus header — still short. */
export function rivalryTagline(leader: RivalRow | undefined): string {
  if (!leader) return "No sheets to rank yet.";
  const { today, roi, nav } = leader.medals;
  return `${leader.name} leads — today ${ordinal(today)}, lifetime ${ordinal(roi)}, size ${ordinal(nav)}.`;
}
