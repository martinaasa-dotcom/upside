import { finiteNumber, roundMoney, safeDiv } from "@/lib/money";

/** Reconstruct a book's NAV path from current size × historical closes.
 * Assumes the viewer held the same names and share counts, and that cash
 * sat still. An educated fill-in, not a trade blotter. */

export type AssumedPosition = { ticker: string; shares: number };
export type NavPoint = { date: string; nav: number };
export type DailyClose = { date: string; close: number };

export function reconstructAssumedNav(
  cash: number,
  positions: AssumedPosition[],
  closesByTicker: Record<string, DailyClose[]>
): NavPoint[] {
  const legs = positions
    .map((p) => {
      const ticker = p.ticker.toUpperCase();
      const shares = Number(p.shares);
      if (!Number.isFinite(shares) || shares === 0) return null;
      const rows = closesByTicker[ticker] ?? [];
      if (rows.length === 0) return null;
      const byDate = new Map(rows.map((r) => [r.date, r.close]));
      return {
        shares,
        byDate,
        dates: rows.map((r) => r.date),
      };
    })
    .filter(
      (
        m
      ): m is {
        shares: number;
        byDate: Map<string, number>;
        dates: string[];
      } => m != null
    );

  if (legs.length === 0) return [];

  const allDates = [
    ...new Set(legs.flatMap((m) => m.dates)),
  ].sort();
  const lastClose = legs.map(() => 0);
  const out: NavPoint[] = [];
  for (const date of allDates) {
    let nav = finiteNumber(cash);
    legs.forEach((leg, i) => {
      const close = leg.byDate.get(date);
      if (close != null && Number.isFinite(close) && close > 0) {
        lastClose[i] = close;
      }
      nav += leg.shares * (lastClose[i] ?? 0);
    });
    out.push({ date, nav: roundMoney(nav) });
  }
  return out;
}

/** Year-start book value implied by a live total and a year-to-date fraction. */
export function startNavFromYtdPct(liveNav: number, ytdPct: number): number {
  const denom = 1 + ytdPct;
  if (!(liveNav > 0) || !Number.isFinite(denom) || Math.abs(denom) < 1e-6) {
    return finiteNumber(liveNav);
  }
  return roundMoney(safeDiv(liveNav, denom));
}

/**
 * Keep the assumed path's shape, but pin the year to a real start value
 * and today's live total. Buys and sells still aren't in the line. The
 * size of the year is.
 */
export function applyYtdAnchor(
  points: NavPoint[],
  startNav: number,
  liveNav?: number
): NavPoint[] {
  if (points.length < 2 || !(startNav > 0) || !Number.isFinite(startNav)) {
    return points;
  }
  const first = points[0]!.nav;
  const last = points[points.length - 1]!.nav;
  const end =
    liveNav != null && Number.isFinite(liveNav) && liveNav > 0
      ? liveNav
      : last;
  const srcSpan = last - first;
  const dstSpan = end - startNav;
  if (Math.abs(srcSpan) < 1e-6) {
    const n = points.length - 1;
    return points.map((p, i) => ({
      date: p.date,
      nav: roundMoney(startNav + safeDiv(dstSpan * i, n)),
    }));
  }
  return points.map((p) => ({
    date: p.date,
    nav: roundMoney(startNav + safeDiv(p.nav - first, srcSpan) * dstSpan),
  }));
}

function isoWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((dt.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** One point per ISO week (last print in the week), plus the latest day. */
export function downsampleToWeeks(points: NavPoint[]): NavPoint[] {
  if (points.length <= 2) return points;
  const byWeek = new Map<string, NavPoint>();
  for (const p of points) {
    byWeek.set(isoWeekKey(p.date), p);
  }
  const out = [...byWeek.values()].sort((a, b) => a.date.localeCompare(b.date));
  const last = points[points.length - 1]!;
  if (out[out.length - 1]?.date !== last.date) out.push(last);
  return out;
}
