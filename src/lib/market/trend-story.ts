/**
 * Turns the raw indicator numbers from trends-cache into something a
 * complete novice can read in one glance: a verdict, a plain sentence,
 * and the handful of signals that back it up.
 *
 * Deliberately a pure function over plain data (no fetching, no React) so
 * it's the same story-building logic on server and client, and testable
 * without touching the network.
 */

export type TrendRegime =
  | "strong-up"
  | "weakening"
  | "strong-down"
  | "recovering"
  | "flat";

export type TrendRowLike = {
  ticker: string;
  regime: TrendRegime;
  aboveLongMa: boolean | null;
  rsi: number | null;
  macdBuilding: boolean | null;
  divergence: {
    kind: "bearish" | "bullish";
    weeksAgo: number;
    priceFrom: number;
    priceTo: number;
    rsiFrom: number;
    rsiTo: number;
  } | null;
  rs13: number | null;
  rs26: number | null;
};

export type Tone = "gain" | "loss" | "warn" | "neutral";

export type Signal = {
  key: string;
  label: string;
  value: string;
  tone: Tone;
  help: string;
};

export type TrendStory = {
  headline: string;
  tone: Tone;
  sentence: string;
  signals: Signal[];
  /** True when this name's story is actually moving, so it's worth surfacing first. */
  attention: boolean;
  /** Rough priority for sorting: higher sorts first. */
  priority: number;
};

const REGIME_BASE: Record<
  TrendRegime,
  { headline: string; tone: Tone; sentence: string }
> = {
  "strong-up": {
    headline: "Strong uptrend",
    tone: "gain",
    sentence: "TICKER is trending up: it's above its long-term average, and that average is still climbing.",
  },
  weakening: {
    headline: "Trend rolling over",
    tone: "warn",
    sentence: "TICKER is still above its long-term average, but that average has started turning down, often the first sign a trend is running out of road.",
  },
  "strong-down": {
    headline: "Downtrend",
    tone: "loss",
    sentence: "TICKER is trending down: it's below its long-term average, and that average is still falling.",
  },
  recovering: {
    headline: "Turning up",
    tone: "gain",
    sentence: "TICKER is still below its long-term average, but that average has started rising, an early sign of a turn.",
  },
  flat: {
    headline: "No clear trend",
    tone: "neutral",
    sentence: "TICKER isn't showing enough direction to call a trend either way right now.",
  },
};

/**
 * Divergence either reinforces or contradicts the regime's story. When it
 * contradicts, that's the actual news, so it wins the headline. All
 * sentences carry a literal "TICKER" placeholder swapped in at the end,
 * so composing them never risks doubling or misplacing the ticker name.
 */
function applyDivergence(
  base: { headline: string; tone: Tone; sentence: string },
  divergence: TrendRowLike["divergence"]
): { headline: string; tone: Tone; sentence: string } {
  if (!divergence) return base;
  const bearish = divergence.kind === "bearish";
  const bullishBase = base.tone === "gain";
  const bearishBase = base.tone === "loss";

  // Divergence agrees with the trend: reinforces it, doesn't change the verdict.
  if ((bearish && bearishBase) || (!bearish && bullishBase)) {
    return {
      headline: base.headline,
      tone: base.tone,
      sentence: `${base.sentence} Momentum backs that up too.`,
    };
  }

  // Divergence fights an uptrend: the warning is the headline.
  if (bearish && bullishBase) {
    return {
      headline: "Uptrend losing power",
      tone: "warn",
      sentence:
        "TICKER is still trending up, but each new high has come with less force behind it than the last one. That's usually the first crack, not the break itself.",
    };
  }

  // Divergence fights a downtrend: possible early turn.
  if (!bearish && bearishBase) {
    return {
      headline: "Downtrend, but showing cracks",
      tone: "warn",
      sentence:
        "TICKER is still trending down, but the latest low came with less selling force than the one before it. Often the first sign before a bottom, not a guarantee of one.",
    };
  }

  // Neutral/weakening/recovering regime plus a divergence that doesn't
  // cleanly agree: flag it as mixed rather than force a false clarity.
  return {
    headline: "Mixed signals",
    tone: "neutral",
    sentence:
      "TICKER's long-term trend and its recent momentum are pointing in different directions right now. No clean story yet, worth watching rather than acting on.",
  };
}

function rsiZone(rsi: number | null): { label: string; tone: Tone; help: string } {
  if (rsi == null) {
    return { label: "—", tone: "neutral", help: "Not enough history yet." };
  }
  if (rsi >= 70) {
    return {
      label: "Overbought",
      tone: "warn",
      help: "Weekly RSI is stretched to the upside. Not a sell signal on its own, momentum can stay stretched for months, but it means the easy gains are already behind it.",
    };
  }
  if (rsi <= 30) {
    return {
      label: "Oversold",
      tone: "gain",
      help: "Weekly RSI is washed out to the downside. Not a buy signal on its own, but selling pressure looks exhausted for now.",
    };
  }
  return {
    label: "Neutral",
    tone: "neutral",
    help: "Weekly RSI is in the middle of its range, neither stretched nor washed out.",
  };
}

function rsText(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

export function buildTrendStory(row: TrendRowLike): TrendStory {
  const base = REGIME_BASE[row.regime];
  const withDivergence = applyDivergence(base, row.divergence);
  const zone = rsiZone(row.rsi);

  const signals: Signal[] = [
    {
      key: "trend",
      label: "Trend",
      value:
        row.regime === "strong-up"
          ? "Uptrend"
          : row.regime === "strong-down"
            ? "Downtrend"
            : row.regime === "weakening"
              ? "Weakening"
              : row.regime === "recovering"
                ? "Turning up"
                : "No trend",
      tone: REGIME_BASE[row.regime].tone,
      help: "Whether price sits above or below its own 40-week average, and which way that average is sloping. This is the textbook definition of a trend.",
    },
    {
      key: "momentum",
      label: "Momentum",
      value:
        row.macdBuilding == null ? "—" : row.macdBuilding ? "Building" : "Fading",
      tone:
        row.macdBuilding == null
          ? "neutral"
          : row.macdBuilding
            ? "gain"
            : "neutral",
      help: "Whether weekly MACD is growing or shrinking, a read on whether the move is speeding up or losing pace, separate from which direction it's going.",
    },
    {
      key: "rsi",
      label: "RSI",
      value: row.rsi == null ? "—" : `${row.rsi.toFixed(0)} · ${zone.label}`,
      tone: zone.tone,
      help: `Weekly RSI(14): ${zone.help}`,
    },
    {
      key: "rs",
      label: "vs S&P (13w)",
      value: rsText(row.rs13),
      tone: row.rs13 == null ? "neutral" : row.rs13 >= 0 ? "gain" : "loss",
      help: "How much this has out- or under-performed the S&P 500 over the last quarter. Positive means money is rotating toward it, not just going up with everything else.",
    },
  ];

  const attention = Boolean(row.divergence) || row.regime === "weakening" || row.regime === "recovering";

  // Rough sort priority: a divergence fighting the trend is the loudest
  // story, then a regime that's actively changing, then everything else
  // ranked by how much it's leading or lagging the index.
  let priority = row.rs13 ?? 0;
  if (row.divergence) priority += withDivergence.tone === "warn" ? 10 : 3;
  if (row.regime === "weakening" || row.regime === "recovering") priority += 5;

  return {
    headline: withDivergence.headline,
    tone: withDivergence.tone,
    sentence: withDivergence.sentence.replace("TICKER", row.ticker),
    signals,
    attention,
    priority,
  };
}
