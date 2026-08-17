/** Rough pairwise correlation from sparkline series (Pearson). */

export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  const pairs: Array<[number, number]> = [];
  for (let i = a.length - n, j = b.length - n; i < a.length && j < b.length; i++, j++) {
    const x = a[i]!;
    const y = b[j]!;
    if (Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y]);
  }
  if (pairs.length < 5) return null;
  const meanA = pairs.reduce((s, [x]) => s + x, 0) / pairs.length;
  const meanB = pairs.reduce((s, [, y]) => s + y, 0) / pairs.length;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (const [x, y] of pairs) {
    const da = x - meanA;
    const db = y - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  if (!(den > 0)) return null;
  const out = num / den;
  return Number.isFinite(out) ? out : null;
}

export type CorrCell = {
  a: string;
  b: string;
  corr: number;
};

export function correlationMatrix(
  series: Array<{ ticker: string; sparkline: number[] }>
): CorrCell[] {
  const cells: CorrCell[] = [];
  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      const c = pearson(series[i]!.sparkline, series[j]!.sparkline);
      if (c == null) continue;
      cells.push({
        a: series[i]!.ticker,
        b: series[j]!.ticker,
        corr: c,
      });
    }
  }
  return cells.sort((x, y) => Math.abs(y.corr) - Math.abs(x.corr));
}

/** Square matrix for heat-grid UI (diagonal = 1). */
export function correlationGrid(
  series: Array<{ ticker: string; sparkline: number[] }>
): { tickers: string[]; grid: (number | null)[][] } {
  const tickers = series.map((s) => s.ticker);
  const grid: (number | null)[][] = tickers.map(() =>
    tickers.map(() => null)
  );
  for (let i = 0; i < series.length; i++) {
    grid[i]![i] = 1;
    for (let j = i + 1; j < series.length; j++) {
      const c = pearson(series[i]!.sparkline, series[j]!.sparkline);
      grid[i]![j] = c;
      grid[j]![i] = c;
    }
  }
  return { tickers, grid };
}
