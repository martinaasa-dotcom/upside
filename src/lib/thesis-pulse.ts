import { TICKER_SECTORS } from "@/lib/forecast-plan";
import type { OverviewModel, TickerScore } from "@/lib/overview";
import type { Quote } from "@/lib/types";
import { todayKeyInTz } from "@/lib/timezone";
import { z } from "zod";

/** Fraction — 0.05 = 5% */
export const PULSE_DOWN_THRESHOLD = 0.05;
export const PULSE_MIN_BOOK_PCT = 0.02;
export const PULSE_DEFAULT_TOP_N = 10;

export type PulseMoveSource = "regular" | "pre" | "post";

export type PulseCandidate = {
  ticker: string;
  shares: number;
  buyValue: number;
  currentValue: number;
  roiPct: number;
  roiDollar: number;
  todayDollar: number;
  bookPct: number;
  portfolios: string[];
  price: number;
  regularPct: number | null;
  extendedPct: number | null;
  effectivePct: number | null;
  moveLabel: string;
  moveSource: PulseMoveSource;
  /** Down ≥5% on effective move — the “should I sell?” flag */
  needsAttention: boolean;
  inBook: boolean;
};

export type ThesisStatus = "intact" | "watch" | "broken";

export type PulseAction = "add" | "hold" | "trim" | "watch";

export type PulseHeadline = {
  title: string;
  publisher: string;
  link: string;
  publishedAt: string;
};

export type PulseCheck = {
  ticker: string;
  situation: string;
  moveReason: string;
  thesisStatus: ThesisStatus;
  earningsNote: string;
  action: PulseAction;
  /** Suggested trim size when action=trim, e.g. 15 means trim 15% of position. */
  trimPct?: number | null;
  /** When to add — "Add now ~$X" or "Add now · more below ~$Y". Empty if trim. */
  addLevel: string;
  verdict: string;
};

export type PulseReport = {
  generatedAt: string;
  summary: string;
  checks: PulseCheck[];
};

export type PulseCacheEntry = {
  report: PulseReport;
  headlines: Record<string, PulseHeadline[]>;
  cachedAt: string;
};

export const pulseReportSchema = z.object({
  summary: z
    .string()
    .describe(
      "One plain sentence on the book's big lines — lead with any sharp drops and whether they're noise or thesis risk."
    ),
  checks: z.array(
    z.object({
      ticker: z.string(),
      situation: z
        .string()
        .describe(
          "2–3 short sentences: current situation explainer using the supplied news headlines. Plain English."
        ),
      moveReason: z
        .string()
        .describe(
          "One sentence on what drove the move (cite news when possible)."
        ),
      thesisStatus: z.enum(["intact", "watch", "broken"]),
      action: z
        .enum(["add", "hold", "trim", "watch"])
        .describe(
          "add = deploy on intact thesis dip; hold = no change; trim = reduce; watch = wait for clarity."
        ),
      trimPct: z
        .number()
        .min(5)
        .max(50)
        .nullable()
        .optional()
        .describe(
          "Only when action=trim: percent of position to trim as take-profit (e.g. 10, 15, 20). Null otherwise."
        ),
      addLevel: z
        .string()
        .describe(
          'Concrete add trigger: "Add now ~$X" and/or "stagger below ~$Y". Required when action=add or thesis intact on a dip. Empty only for trim. Not greedy — Y within ~5–12% below spot.'
        ),
      earningsNote: z
        .string()
        .describe(
          "Recent/upcoming earnings in plain English; empty string if not relevant."
        ),
      verdict: z
        .string()
        .describe(
          "One sentence tying action + addLevel to the thesis — not generic hold language."
        ),
    })
  ),
});

const PULSE_CACHE_KEY = "upside-pulse-v3";
export const PULSE_REFRESH_MS = 60 * 60 * 1000;

export function effectiveMove(quote: Quote | null | undefined): {
  pct: number | null;
  label: string;
  source: PulseMoveSource;
  extendedPct: number | null;
} {
  if (!quote) {
    return { pct: null, label: "Today", source: "regular", extendedPct: null };
  }

  const regular = quote.changePercent ?? null;
  const pre = quote.preMarketChangePercent ?? null;
  const post = quote.postMarketChangePercent ?? null;
  const state = (quote.marketState ?? "").toUpperCase();
  const extended = post ?? pre;

  if (state.includes("PRE") && !state.includes("POST") && pre != null) {
    return { pct: pre, label: "Pre-market", source: "pre", extendedPct: pre };
  }
  if (state.includes("POST") && post != null) {
    return { pct: post, label: "After-hours", source: "post", extendedPct: post };
  }

  if (extended != null && regular != null && Math.abs(extended) > Math.abs(regular)) {
    const source: PulseMoveSource = post != null ? "post" : "pre";
    return {
      pct: extended,
      label: source === "post" ? "After-hours" : "Pre-market",
      source,
      extendedPct: extended,
    };
  }

  return {
    pct: regular,
    label: "Today",
    source: "regular",
    extendedPct: extended,
  };
}

function toCandidate(
  ticker: string,
  row: TickerScore | null,
  quote: Quote | null | undefined,
  equity: number
): PulseCandidate {
  const move = effectiveMove(quote);
  const effectivePct = move.pct;
  const currentValue = row?.currentValue ?? (quote?.price ?? 0);
  const bookPct = row && equity > 0 ? row.currentValue / equity : 0;

  return {
    ticker: ticker.toUpperCase(),
    shares: row?.shares ?? 0,
    buyValue: row?.buyValue ?? 0,
    currentValue,
    roiPct: row?.roiPct ?? 0,
    roiDollar: row?.roiDollar ?? 0,
    todayDollar: row?.todayDollar ?? 0,
    bookPct,
    portfolios: row?.portfolios ?? [],
    price: quote?.price ?? row?.price ?? 0,
    regularPct: quote?.changePercent ?? row?.todayPct ?? null,
    extendedPct: move.extendedPct,
    effectivePct,
    moveLabel: move.label,
    moveSource: move.source,
    needsAttention:
      effectivePct != null && effectivePct <= -PULSE_DOWN_THRESHOLD,
    inBook: Boolean(row),
  };
}

/** Default Pulse set: all big book lines + anything down ≥5% (incl. pre/after). */
export function buildPulseCandidates(
  overview: OverviewModel,
  quotes: Record<string, Quote>,
  opts?: { extraTickers?: string[]; topN?: number }
): PulseCandidate[] {
  const topN = opts?.topN ?? PULSE_DEFAULT_TOP_N;
  const equity = overview.totals.equityValue;
  const byTicker = new Map(overview.tickers.map((t) => [t.ticker.toUpperCase(), t]));

  const big = overview.tickers
    .filter(
      (t) =>
        equity <= 0 ||
        t.currentValue / equity >= PULSE_MIN_BOOK_PCT ||
        overview.tickers.indexOf(t) < topN
    )
    .slice(0, topN);

  const keys = new Set<string>(big.map((t) => t.ticker.toUpperCase()));

  for (const t of overview.tickers) {
    const q = quotes[t.ticker];
    const move = effectiveMove(q);
    if (move.pct != null && move.pct <= -PULSE_DOWN_THRESHOLD) {
      keys.add(t.ticker.toUpperCase());
    }
  }

  for (const raw of opts?.extraTickers ?? []) {
    const key = raw.trim().toUpperCase();
    if (key) keys.add(key);
  }

  const candidates = [...keys].map((ticker) => {
    const row = byTicker.get(ticker) ?? null;
    return toCandidate(ticker, row, quotes[ticker] ?? null, equity);
  });

  return candidates.sort((a, b) => {
    if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
    if (a.needsAttention && b.needsAttention) {
      return (a.effectivePct ?? 0) - (b.effectivePct ?? 0);
    }
    return b.bookPct - a.bookPct || b.currentValue - a.currentValue;
  });
}

/** Build one pulse row — for search / single-ticker check. */
export function buildPulseCandidate(
  ticker: string,
  overview: OverviewModel,
  quotes: Record<string, Quote>
): PulseCandidate {
  const key = ticker.trim().toUpperCase();
  const row =
    overview.tickers.find((t) => t.ticker.toUpperCase() === key) ?? null;
  return toCandidate(key, row, quotes[key] ?? null, overview.totals.equityValue);
}

export function pulseCacheKey(tickers: string[]): string {
  const day = todayKeyInTz();
  const list = [...tickers].sort().join(",");
  return `${PULSE_CACHE_KEY}:${day}:${list}`;
}

export function pulseSingleCacheKey(ticker: string): string {
  const day = todayKeyInTz();
  return `${PULSE_CACHE_KEY}:${day}:single:${ticker.trim().toUpperCase()}`;
}

export function loadPulseCache(key: string): PulseCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as
      | PulseCacheEntry
      | PulseReport
      | null;
    if (
      parsed &&
      typeof parsed === "object" &&
      "report" in parsed &&
      "headlines" in parsed &&
      "cachedAt" in parsed
    ) {
      return parsed as PulseCacheEntry;
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      "generatedAt" in parsed &&
      "checks" in parsed
    ) {
      return {
        report: parsed as PulseReport,
        headlines: {},
        cachedAt: (parsed as PulseReport).generatedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function savePulseCache(key: string, entry: PulseCacheEntry) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}

export function isPulseCacheFresh(
  entry: PulseCacheEntry | null,
  maxAgeMs = PULSE_REFRESH_MS
): boolean {
  if (!entry?.cachedAt) return false;
  const ts = new Date(entry.cachedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < maxAgeMs;
}

export function statusLabel(status: ThesisStatus): string {
  if (status === "intact") return "Thesis intact";
  if (status === "watch") return "Watch";
  return "Thesis at risk";
}

export function actionLabel(action: PulseAction): string {
  if (action === "add") return "Add";
  if (action === "trim") return "Trim";
  if (action === "watch") return "Wait";
  return "Hold";
}

export function sectorForTicker(ticker: string): string | null {
  return TICKER_SECTORS[ticker.toUpperCase()] ?? null;
}

export function formatMovePct(pct: number | null): string {
  if (pct == null || Number.isNaN(pct)) return "—";
  return `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}%`;
}

/**
 * Deterministic fallback so every visible card gets a colored action/status
 * even if the model misses a ticker in its response.
 */
export function buildFallbackPulseCheck(candidate: PulseCandidate): PulseCheck {
  const move = candidate.effectivePct ?? 0;
  const movePct = formatMovePct(candidate.effectivePct);
  const euphoric =
    move >= 0.12 || (move >= 0.08 && candidate.roiPct >= 0.5);
  if (euphoric) {
    const trimPct = candidate.bookPct >= 0.08 ? 20 : 10;
    return {
      ticker: candidate.ticker,
      situation:
        "Momentum is running hot and price action looks stretched versus a normal day range.",
      moveReason:
        "Likely momentum/euphoria extension rather than a thesis reset.",
      thesisStatus: "watch",
      earningsNote: "",
      action: "trim",
      trimPct,
      addLevel: "",
      verdict: `Take profit discipline: trim ${trimPct}% into strength and keep the core position for the long thesis.`,
    };
  }

  if (candidate.needsAttention) {
    const price = candidate.price > 0 ? candidate.price.toFixed(2) : "spot";
    return {
      ticker: candidate.ticker,
      situation:
        "This is a sharp down move that needs a thesis check, but no hard break is confirmed from market move alone.",
      moveReason: `${candidate.moveLabel} move is ${movePct}.`,
      thesisStatus: "intact",
      earningsNote: "",
      action: "add",
      trimPct: null,
      addLevel: `Add now ~$${price} · stagger below ~${(
        candidate.price * 0.92
      ).toFixed(2)}`,
      verdict:
        "If the thesis is intact, treat this as a buyable dip instead of an auto-sell signal.",
    };
  }

  return {
    ticker: candidate.ticker,
    situation:
      "No stress signal from today’s move. Position remains in normal monitoring mode.",
    moveReason: `${candidate.moveLabel} move is ${movePct}.`,
    thesisStatus: "intact",
    earningsNote: "",
    action: "hold",
    trimPct: null,
    addLevel: "",
    verdict: "Hold and reassess on new catalysts, earnings, or thesis-changing news.",
  };
}
