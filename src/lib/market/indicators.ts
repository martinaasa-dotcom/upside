/**
 * Trend indicators, deliberately few and deliberately slow.
 *
 * The goal is "has the narrative changed", not "should I trade today", so
 * everything here runs on weekly bars and the thresholds are set to fire
 * rarely. A signal that triggers every other week is noise wearing a
 * signal's clothes.
 *
 * All pure functions over a close series, so they're testable without
 * touching the network.
 */

export type Bar = { date: string; close: number };

/** Simple moving average, aligned to the input (null until enough data). */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

/** Exponential moving average, seeded with the first SMA. */
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * Wilder's RSI. Uses Wilder smoothing (not a plain average of the last n)
 * because that's what every charting package draws, and a signal that
 * disagrees with the user's own chart is worse than no signal.
 */
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export type Macd = {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
};

export function macd(values: number[], fast = 12, slow = 26, sig = 9): Macd {
  const fastE = ema(values, fast);
  const slowE = ema(values, slow);
  const line = values.map((_, i) =>
    fastE[i] != null && slowE[i] != null ? fastE[i]! - slowE[i]! : null
  );
  // The signal line is an EMA of the MACD line, which only exists from the
  // slow period onward, so seed it off the defined slice and pad back.
  const defined = line.filter((v): v is number => v != null);
  const sigDefined = ema(defined, sig);
  const pad = line.length - defined.length;
  const signal = [
    ...new Array<number | null>(pad).fill(null),
    ...sigDefined,
  ];
  const histogram = line.map((v, i) =>
    v != null && signal[i] != null ? v - signal[i]! : null
  );
  return { macd: line, signal, histogram };
}

/** Collapse daily bars into weekly (last close of each ISO week). */
export function toWeekly(bars: Bar[]): Bar[] {
  const byWeek = new Map<string, Bar>();
  for (const b of bars) {
    const d = new Date(b.date + "T00:00:00Z");
    if (Number.isNaN(d.getTime())) continue;
    // ISO week key: Thursday of the same week determines the year/week.
    const day = (d.getUTCDay() + 6) % 7;
    const thursday = new Date(d);
    thursday.setUTCDate(d.getUTCDate() - day + 3);
    const firstThursday = new Date(
      Date.UTC(thursday.getUTCFullYear(), 0, 4)
    );
    const week =
      1 +
      Math.round(
        ((thursday.getTime() - firstThursday.getTime()) / 86400000 -
          3 +
          ((firstThursday.getUTCDay() + 6) % 7)) /
          7
      );
    const key = `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
    // Later bars overwrite, so each week ends up holding its final close.
    byWeek.set(key, b);
  }
  return [...byWeek.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Index of local extrema, using a symmetric lookaround window. */
function pivots(values: (number | null)[], window: number, kind: "high" | "low") {
  const out: number[] = [];
  for (let i = window; i < values.length - window; i++) {
    const v = values[i];
    if (v == null) continue;
    let isPivot = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      const o = values[j];
      if (o == null) continue;
      if (kind === "high" ? o > v : o < v) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) out.push(i);
  }
  return out;
}

export type Divergence = {
  kind: "bearish" | "bullish";
  /** Bars ago the confirming pivot sat, so stale signals can be dropped. */
  barsAgo: number;
  priceFrom: number;
  priceTo: number;
  rsiFrom: number;
  rsiTo: number;
};

/**
 * Classic RSI divergence on the last two swings.
 *
 * Bearish: price prints a higher high while RSI prints a lower high, i.e.
 * the new high was made with less force than the old one. Bullish is the
 * mirror. Requires the RSI to have been in stretched territory at the
 * earlier pivot, which filters out the constant micro-divergences that
 * make naive implementations useless.
 */
export function rsiDivergence(
  closes: number[],
  rsiSeries: (number | null)[],
  opts: { window?: number; maxBarsAgo?: number; minGapBars?: number } = {}
): Divergence | null {
  const window = opts.window ?? 3;
  const maxBarsAgo = opts.maxBarsAgo ?? 8;
  const minGapBars = opts.minGapBars ?? 5;
  const n = closes.length;

  for (const kind of ["bearish", "bullish"] as const) {
    const idx = pivots(closes, window, kind === "bearish" ? "high" : "low");
    if (idx.length < 2) continue;
    const b = idx[idx.length - 1]!;
    const a = idx[idx.length - 2]!;
    if (b - a < minGapBars) continue;
    if (n - 1 - b > maxBarsAgo) continue;

    const pa = closes[a]!;
    const pb = closes[b]!;
    const ra = rsiSeries[a];
    const rb = rsiSeries[b];
    if (ra == null || rb == null) continue;

    const priceMoved = kind === "bearish" ? pb > pa : pb < pa;
    const rsiFaded = kind === "bearish" ? rb < ra : rb > ra;
    // The earlier pivot has to have been an actual extreme, otherwise this
    // fires on every wobble in the middle of the range.
    const wasStretched = kind === "bearish" ? ra >= 60 : ra <= 40;
    if (priceMoved && rsiFaded && wasStretched) {
      return {
        kind,
        barsAgo: n - 1 - b,
        priceFrom: pa,
        priceTo: pb,
        rsiFrom: ra,
        rsiTo: rb,
      };
    }
  }
  return null;
}

export type TrendRegime =
  | "strong-up"
  | "weakening"
  | "strong-down"
  | "recovering"
  | "flat";

/**
 * Where price sits relative to its long trend. Uses weekly bars, so "40"
 * is roughly the 200-day average and "10" the 50-day.
 */
export function trendRegime(weeklyCloses: number[]): {
  regime: TrendRegime;
  aboveLong: boolean | null;
  longSlopePct: number | null;
  longMa: number | null;
  price: number | null;
} {
  const long = sma(weeklyCloses, 40);
  const short = sma(weeklyCloses, 10);
  const i = weeklyCloses.length - 1;
  const l = long[i];
  const s = short[i];
  const lPrev = long[i - 8] ?? null;
  if (l == null || s == null) {
    return {
      regime: "flat",
      aboveLong: null,
      longSlopePct: null,
      longMa: null,
      price: null,
    };
  }
  const price = weeklyCloses[i]!;
  const aboveLong = price > l;
  const slope = lPrev != null && lPrev > 0 ? (l - lPrev) / lPrev : null;
  const rising = (slope ?? 0) > 0.005;
  const falling = (slope ?? 0) < -0.005;

  let regime: TrendRegime = "flat";
  if (aboveLong && rising) regime = "strong-up";
  else if (aboveLong && falling) regime = "weakening";
  else if (!aboveLong && falling) regime = "strong-down";
  else if (!aboveLong && rising) regime = "recovering";

  return { regime, aboveLong, longSlopePct: slope, longMa: l, price };
}

/**
 * Raw % change over the last N weekly closes — deliberately the fastest,
 * dumbest number in this file. The trend/momentum reads above are smoothed
 * over many weeks on purpose (so they don't whipsaw), which means a sudden
 * catalyst — a blowout earnings print, a guidance raise — can move the
 * price hard for two or three weeks before the slow measures catch up and
 * start agreeing with it. This is what lets the UI say "yes, the slow
 * trend line is still pointed down, but look at this" instead of just
 * reporting the lagging read as if it were the whole story.
 */
export function nWeekChange(closes: number[], weeks: number): number | null {
  const n = closes.length;
  if (n <= weeks) return null;
  const from = closes[n - 1 - weeks]!;
  const to = closes[n - 1]!;
  if (!(from > 0)) return null;
  return to / from - 1;
}

/**
 * Relative strength versus a benchmark: how much a name has outpaced (or
 * lagged) the index over a window. This is what sector rotation actually
 * is, so it drives the rotation view rather than raw return.
 */
export function relativeStrength(
  closes: number[],
  benchCloses: number[],
  barsBack: number
): number | null {
  const n = Math.min(closes.length, benchCloses.length);
  if (n <= barsBack) return null;
  const a0 = closes[n - 1 - barsBack]!;
  const a1 = closes[n - 1]!;
  const b0 = benchCloses[n - 1 - barsBack]!;
  const b1 = benchCloses[n - 1]!;
  if (!(a0 > 0) || !(b0 > 0)) return null;
  return a1 / a0 - b1 / b0;
}
