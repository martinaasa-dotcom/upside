/** Rough pairwise correlation from sparkline series (Pearson). */

export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  const ax = a.slice(-n);
  const bx = b.slice(-n);
  const meanA = ax.reduce((s, x) => s + x, 0) / n;
  const meanB = bx.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = ax[i]! - meanA;
    const db = bx[i]! - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  if (den === 0) return null;
  return num / den;
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
