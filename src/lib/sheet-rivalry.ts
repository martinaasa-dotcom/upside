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

/**
 * Ranks your own sheets against each other on a blend of today's P&L
 * (weighted heaviest), lifetime return, then book size. Feeds the ordering
 * and rank badges in Overview's Portfolios list, which is the only place
 * this is shown.
 */
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

