import { humanizeMargusText, humanizeMargusTree } from "@/lib/ai/humanize-copy";
import { TICKER_SECTORS } from "@/lib/forecast-plan";
import type { OverviewModel, TickerScore } from "@/lib/overview";
import type { Quote } from "@/lib/types";

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

/**
 * trim and sell look similar but mean opposite situations: trim is
 * disciplined profit-taking on a winner that ran too hot (thesis still
 * intact or at most "watch"), sell is what you do when the thesis is
 * actually broken. Collapsing them into one "reduce" action is what made
 * a euphoric name and a genuinely broken one look the same on screen.
 */
export type PulseAction = "add" | "hold" | "trim" | "sell" | "watch";

export type PulseHeadline = {
  title: string;
  publisher: string;
  link: string;
  publishedAt: string;
};

/**
 * `situation` used to be one prose blob and is now bullets, but reports
 * cached in localStorage before that change still hold a string. Split
 * those on sentence boundaries so an old cached report still renders as a
 * list instead of crashing on .map or showing nothing.
 */
export function normalizePulseSituation(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string" && !!v.trim());
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export type PulseCheck = {
  ticker: string;
  /** Short bullets, not a paragraph. Reports cached before this changed
   * hold a single string; normalizePulseSituation() handles both. */
  situation: string[];
  moveReason: string;
  thesisStatus: ThesisStatus;
  earningsNote: string;
  action: PulseAction;
  /** Suggested trim size when action=trim, e.g. 15 means trim 15% of position. */
  trimPct?: number | null;
  /** When to add — "Add now ~$X" or "Add now · more below ~$Y". Empty if trim. */
  addLevel: string;
  verdict: string;
  /**
   * Concrete, falsifiable: what would actually invalidate the reason this
   * is in the book. Status can only leave intact if today's facts match
   * this bar (watch) or have already cleared it (broken).
   */
  thesisBreak?: string;
};

export type PulseReport = {
  generatedAt: string;
  summary: string;
  checks: PulseCheck[];
};

/** Per-ticker cache — the unit every Pulse check is retained under. */
export type PulseTickerCacheEntry = {
  check: PulseCheck;
  headlines: PulseHeadline[];
  cachedAt: string;
};

export type PulseSummaryCacheEntry = {
  summary: string;
  cachedAt: string;
};

export const PULSE_REFRESH_MS = 60 * 60 * 1000;
const PULSE_TICKER_CACHE_PREFIX = "upside-pulse-ticker-v1:";
const PULSE_SUMMARY_CACHE_KEY = "upside-pulse-summary-v1";

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
    todayDollar:
      effectivePct != null && Number.isFinite(effectivePct) && effectivePct > -1
        ? currentValue - currentValue / (1 + effectivePct)
        : 0,
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

/**
 * Per-ticker cache — deliberately NOT scoped to a calendar day. Keying by
 * day meant every result became unreachable at midnight Tallinn time, so
 * the very first Pulse view each day showed "Pulling news & checking
 * thesis…" for every single position even though nothing had actually
 * changed. Freshness is judged purely by `cachedAt` age (isPulseCacheFresh)
 * — a result is retained and shown indefinitely until a newer one replaces
 * it, whatever day that happens to be.
 */
export function pulseTickerCacheKey(ticker: string): string {
  return `${PULSE_TICKER_CACHE_PREFIX}${ticker.trim().toUpperCase()}`;
}

export function loadPulseTickerCache(
  ticker: string
): PulseTickerCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(pulseTickerCacheKey(ticker));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PulseTickerCacheEntry | null;
    if (!parsed?.check || !parsed?.cachedAt) return null;
    return {
      ...parsed,
      check: normalizePulseCheck(humanizeMargusTree(parsed.check)),
    };
  } catch {
    return null;
  }
}

export function savePulseTickerCache(
  ticker: string,
  entry: PulseTickerCacheEntry
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      pulseTickerCacheKey(ticker),
      JSON.stringify({
        ...entry,
        check: normalizePulseCheck(humanizeMargusTree(entry.check)),
      })
    );
  } catch {
    /* ignore */
  }
}

export function loadPulseSummary(): PulseSummaryCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PULSE_SUMMARY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PulseSummaryCacheEntry | null;
    if (!parsed?.summary) return null;
    return {
      ...parsed,
      summary: humanizeMargusText(parsed.summary),
    };
  } catch {
    return null;
  }
}

export function savePulseSummary(summary: string) {
  if (typeof window === "undefined" || !summary.trim()) return;
  try {
    localStorage.setItem(
      PULSE_SUMMARY_CACHE_KEY,
      JSON.stringify({
        summary: humanizeMargusText(summary),
        cachedAt: new Date().toISOString(),
      })
    );
  } catch {
    /* ignore */
  }
}

export function isPulseCacheFresh(
  entry: { cachedAt: string } | null,
  maxAgeMs = PULSE_REFRESH_MS
): boolean {
  if (!entry?.cachedAt) return false;
  const ts = new Date(entry.cachedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < maxAgeMs;
}

/**
 * Auto Pulse may call the model only for a name that was never checked,
 * or a name that is down hard and whose last check is stale. Quiet names
 * keep the last read until the person hits Check again.
 */
export function shouldAutoPulseTicker(input: {
  needsAttention: boolean;
  cachedAt?: string;
}): boolean {
  if (!input.cachedAt) return true;
  if (!input.needsAttention) return false;
  return !isPulseCacheFresh({ cachedAt: input.cachedAt });
}

export function statusLabel(status: ThesisStatus | string): string {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "watch") return "Keep an eye on it";
  if (s === "broken") return "Reason looks shaky";
  return "Reason still holds";
}

export function actionLabel(action: PulseAction | string): string {
  const a = String(action ?? "").trim().toLowerCase();
  if (a === "add") return "Add";
  if (a === "trim") return "Trim";
  if (a === "sell") return "Sell";
  if (a === "watch") return "Wait";
  return "Hold";
}

export function sectorForTicker(ticker: string): string | null {
  return TICKER_SECTORS[ticker.toUpperCase()] ?? null;
}

export function formatMovePct(pct: number | null): string {
  if (pct == null || Number.isNaN(pct)) return "—";
  return `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(1)}%`;
}

const THESIS_STATUSES: ThesisStatus[] = ["intact", "watch", "broken"];
const PULSE_ACTIONS: PulseAction[] = ["add", "hold", "trim", "sell", "watch"];

function asEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  const key = String(value ?? "")
    .trim()
    .toLowerCase();
  return (allowed as readonly string[]).includes(key) ? (key as T) : fallback;
}

const DEFAULT_THESIS_BREAK =
  "This breaks if the reason you own it disappears. Lost the customer, a restatement, or guidance that kills the multi-year case. A quiet day is not that.";

/**
 * Cached Pulse rows went through a sanitizer that title-cased enums
 * (`intact` → `Intact`). Badges then missed the lowercase checks and
 * painted every intact Hold as "Thesis at risk". Lowercase on the way in.
 */
export function normalizePulseCheck(check: PulseCheck): PulseCheck {
  return {
    ...check,
    ticker: String(check.ticker ?? "").toUpperCase(),
    thesisStatus: asEnum(check.thesisStatus, THESIS_STATUSES, "intact"),
    action: asEnum(check.action, PULSE_ACTIONS, "hold"),
    thesisBreak:
      typeof check.thesisBreak === "string" && check.thesisBreak.trim()
        ? check.thesisBreak.trim()
        : DEFAULT_THESIS_BREAK,
  };
}

/**
 * Keeps thesisStatus and action honest against each other. The model
 * doesn't always respect the pairing rules, and the mismatch is what
 * makes the badges meaningless (Hold next to a red "Thesis at risk").
 *
 * - broken only survives with sell. If you'd still hold, add, or wait,
 *   the thesis isn't actually broken; soften to watch.
 * - broken + trim is a wording bug, not a take-profit. Trim means
 *   cutting a winner that ran too hot. Convert to sell.
 * - Copy that says nothing is wrong cannot wear watch/broken.
 *
 * Only ever downgrades or relabels toward the more conservative reading.
 * Never invents a new alarm that wasn't already there.
 */
export function reconcilePulseCheck(check: PulseCheck): PulseCheck {
  const n = normalizePulseCheck(check);
  const copy = [
    ...normalizePulseSituation(n.situation),
    n.verdict,
    n.moveReason,
  ]
    .join(" ")
    .toLowerCase();
  const soundsIntact =
    (/no stress signal/.test(copy) && /normal monitoring/.test(copy)) ||
    (/nothing unusual/.test(copy) && /no reason to change/.test(copy));

  let thesisStatus = n.thesisStatus;
  let action = n.action;

  if (soundsIntact) {
    thesisStatus = "intact";
    if (action === "sell") action = "hold";
  }

  if (thesisStatus === "broken" && action === "trim") {
    return { ...n, thesisStatus, action: "sell", trimPct: null };
  }
  if (thesisStatus === "broken" && action !== "sell") {
    thesisStatus = "watch";
  }
  if (thesisStatus === "intact" && action === "sell") {
    action = "hold";
  }

  return { ...n, thesisStatus, action };
}

/** True when verdict just restates the trim line already on the card. */
export function verdictRepeatsTrim(
  verdict: string | undefined,
  trimPct: number | null | undefined
): boolean {
  const v = (verdict ?? "").trim().toLowerCase();
  if (!v || trimPct == null || !Number.isFinite(trimPct)) return false;
  if (!/\btrim\b/.test(v)) return false;
  if (!new RegExp(`\\b${trimPct}\\s*%`).test(v)) return false;
  const leftover = v
    .replace(/\btrim\b/g, " ")
    .replace(/\babout\b/g, " ")
    .replace(new RegExp(`\\b${trimPct}\\s*%`, "g"), " ")
    .replace(/\binto (this|the) strength\b/g, " ")
    .replace(/\bkeep the rest\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return leftover.length < 12;
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
      situation: [
        "It's running hot.",
        "This looks stretched for a normal day.",
      ],
      moveReason: "Looks like a chase, not a new story.",
      thesisStatus: "watch",
      earningsNote: "",
      action: "trim",
      trimPct,
      addLevel: "",
      verdict: "",
      thesisBreak: DEFAULT_THESIS_BREAK,
    };
  }

  if (candidate.needsAttention) {
    const price = candidate.price > 0 ? candidate.price.toFixed(2) : "spot";
    return {
      ticker: candidate.ticker,
      situation: [
        "Down hard enough to check why you own it.",
        "Price alone doesn't mean the story broke.",
      ],
      moveReason: `${candidate.moveLabel} move is ${movePct}.`,
      thesisStatus: "intact",
      earningsNote: "",
      action: "add",
      trimPct: null,
      addLevel: `Add now ~$${price} · then more if it drops to ~${(
        candidate.price * 0.92
      ).toFixed(2)}`,
      verdict:
        "If you still believe the story, this is a dip to add, not a sell.",
      thesisBreak: DEFAULT_THESIS_BREAK,
    };
  }

  return {
    ticker: candidate.ticker,
    situation: [
      "Nothing unusual today.",
      "No reason to change the position.",
    ],
    moveReason: `${candidate.moveLabel} move is ${movePct}.`,
    thesisStatus: "intact",
    earningsNote: "",
    action: "hold",
    trimPct: null,
    addLevel: "",
    verdict: "Hold. Come back if the story actually changes.",
    thesisBreak: DEFAULT_THESIS_BREAK,
  };
}
