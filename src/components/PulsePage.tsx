"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { track } from "@vercel/analytics";
import {
  currency,
  percent,
  signedCurrency,
  cn,
  plural,
  signedTone,
  cashtag,
} from "@/lib/format";
import {
  EmptyState,
  MicroLabel,
  Panel,
  PanelHeader,
  Pill,
  Reading,
  ScanList,
  Score,
  Scoreboard,
} from "@/components/ui/Panel";
import type { ConvictionMap } from "@/lib/conviction";
import type { FearGreedSnapshot } from "@/lib/market/fear-greed";
import { humanizeMargusText, pulseSuggestion } from "@/lib/ai/humanize-copy";
import { isAbortError } from "@/lib/abort";
import { readJsonOrThrow } from "@/lib/http";
import type { OverviewModel } from "@/lib/overview";
import { formatRelativeTime } from "@/lib/timezone";
import {
  looksLikeTickerQuery,
  mergeAndRankTickerSuggestions,
  pickTickerSuggestion,
  type TickerSuggestion,
} from "@/lib/market/ticker-search";
import { sanitizeTickerQuery } from "@/lib/input-guard";
import { useTickerSearch } from "@/lib/use-ticker-search";
import { normalizeYahooTicker, tickerStem } from "@/lib/ticker";
import type { Quote } from "@/lib/types";
import {
  buildPulseCandidate,
  buildPulseCandidates,
  formatMovePct,
  pulseLeftHold,
  shouldAutoPulseTicker,
  sortPulseCandidates,
  buildPulseScan,
  stripTrailingScanStop,
  loadPulseSummary,
  loadPulseTickerCache,
  reconcilePulseCheck,
  savePulseSummary,
  savePulseTickerCache,
  statusLabel,
  actionLabel,
  normalizePulseSituation,
  verdictRepeatsSuggestion,
  type PulseAction,
  type PulseCheck,
  type PulseHeadline,
  type PulseReport,
  type PulseCandidate,
  type ThesisStatus,
} from "@/lib/thesis-pulse";
import { fundCopyBullets } from "@/lib/fund-copy";
import { loadFearGreedPaint, loadMacroPaint, saveMacroPaint } from "@/lib/paint-cache";
import {
  loadPulseHistory,
  recordPulseHistory,
} from "@/lib/pulse-history";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Eye,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from "react";

type Props = {
  model: OverviewModel;
  quotes: Record<string, Quote>;
  convictions: ConvictionMap;
  intentTicker?: string | null;
  onIntentConsumed?: () => void;
  onWriteThesis?: (ticker: string) => void;
  onStamp?: (
    ticker: string,
    stamp: {
      at: string;
      verdict: string;
      line: string;
      action?: string;
      thesisStatus?: string;
    }
  ) => void;
};

function PulseHistory({ ticker }: { ticker: string }) {
  const prior = loadPulseHistory(ticker).slice(0, -1).at(-1);
  if (!prior) return null;
  return (
    <p className="mt-2 text-sm text-muted-foreground">
      Last time: {actionLabel(prior.action)}, {statusLabel(prior.thesisStatus)}
    </p>
  );
}

function scanLineBody(ticker: string, line: string): string {
  const tag = cashtag(ticker);
  const stripped = line.replace(new RegExp(`^\\${tag}\\s+`, "i"), "").trim();
  return stripTrailingScanStop(stripped || line);
}

function thesisDisplayBullets(text: string | undefined): string[] {
  const sentences = normalizePulseSituation(text ?? "");
  if (sentences.length > 0) return sentences.slice(0, 6);
  return fundCopyBullets(text);
}

function StatusIcon({ status }: { status: ThesisStatus }) {
  if (status === "watch") {
    return <Eye data-icon="inline-start" />;
  }
  if (status === "broken") {
    return <XCircle data-icon="inline-start" />;
  }
  return <CheckCircle2 data-icon="inline-start" />;
}

function ActionBadge({ action }: { action: PulseAction }) {
  const tone =
    action === "add"
      ? "good"
      : action === "sell"
        ? "bad"
        : action === "trim" || action === "watch"
          ? "warn"
          : "neutral";
  return <Pill tone={tone}>{actionLabel(action)}</Pill>;
}

function pulseCardChrome({
  pinned,
  needsLook,
  downDay,
  status,
}: {
  pinned: boolean;
  needsLook: boolean;
  downDay: boolean;
  status: ThesisStatus | null;
}): string {
  if (pinned) return "border-white/20 bg-accent ring-1 ring-ring/30";
  if (needsLook) {
    if (downDay || status === "broken") {
      return "border-l-[3px] border-loss/50 border-l-loss bg-loss/[0.12]";
    }
    return "border-l-[3px] border-caution/50 border-l-caution bg-caution/[0.12]";
  }
  return "border-border bg-muted";
}

function PulseCard({
  candidate: c,
  check,
  headlines,
  loading,
  convictionThesis,
  checkedAt,
  onRefresh,
  onWriteThesis,
  pinned = false,
  leftHold = false,
  needsLook = false,
}: {
  candidate: PulseCandidate;
  check?: PulseCheck;
  headlines: PulseHeadline[];
  loading: boolean;
  convictionThesis?: string;
  checkedAt?: string;
  onRefresh?: () => void;
  onWriteThesis?: () => void;
  pinned?: boolean;
  leftHold?: boolean;
  needsLook?: boolean;
}) {
  const pct = c.effectivePct ?? 0;
  const up = pct >= 0;
  // Re-applied at render time (not just when the check is first cached) so
  // an already-cached "broken" + "hold" contradiction from before this
  // guardrail existed, or from a stale server/localStorage entry, clears
  // immediately instead of waiting out the cache window.
  const shown = check ? reconcilePulseCheck(check) : null;
  const status = shown?.thesisStatus ?? "intact";
  const action = shown?.action ?? "hold";
  const writtenThesis = thesisDisplayBullets(convictionThesis);
  const situation = shown ? normalizePulseSituation(shown.situation) : [];
  const thesisBullets = writtenThesis.length > 0 ? writtenThesis : situation;
  const suggestion = shown ? pulseSuggestion(shown) : "";
  const hasBody =
    thesisBullets.length > 0 ||
    Boolean(suggestion) ||
    Boolean(
      shown?.verdict && !verdictRepeatsSuggestion(shown.verdict, shown)
    ) ||
    Boolean(shown?.earningsNote) ||
    Boolean(shown?.thesisBreak);

  return (
    <li
      id={`pulse-card-${c.ticker}`}
      className={cn(
        "rounded-xl border px-4 py-4 scroll-mt-28",
        pulseCardChrome({
          pinned,
          needsLook,
          downDay: pct < 0,
          status: shown ? status : null,
        })
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-base font-semibold text-foreground">
              {cashtag(c.ticker)}
            </span>
            {pinned && (
              <span className="rounded-md bg-accent px-2 py-0.5 text-sm font-medium text-foreground/80">
                Your check
              </span>
            )}
            {!c.inBook && (
              <span className="rounded-md bg-accent px-2 py-0.5 text-sm text-muted-foreground">
                Lookup
              </span>
            )}
            {leftHold && (
              <span className="rounded-md bg-accent px-2 py-0.5 text-sm font-medium text-foreground/80">
                Was Hold
              </span>
            )}
            {c.isBigMove && (
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-sm font-medium",
                  (c.effectivePct ?? 0) < 0
                    ? "bg-loss/15 text-loss"
                    : "bg-gain/15 text-gain"
                )}
              >
                {(c.effectivePct ?? 0) < 0 ? "Down ≥5%" : "Up ≥5%"}
              </span>
            )}
          </div>
          <p
            className={cn(
              "mt-1 inline-flex items-center gap-1 text-sm font-medium tabular-nums",
              up ? "text-gain" : "text-loss"
            )}
          >
            {up ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {formatMovePct(c.effectivePct)}
            <span className="font-normal text-muted-foreground">{c.moveLabel}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {shown ? (
            <>
              <ActionBadge action={action} />
              <Pill
                tone={
                  status === "broken"
                    ? "bad"
                    : status === "watch"
                      ? "warn"
                      : "good"
                }
              >
                <StatusIcon status={status} />
                {statusLabel(status)}
              </Pill>
            </>
          ) : loading ? (
            <span className="text-sm text-muted-foreground">Checking …</span>
          ) : null}
          {onRefresh && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onRefresh}
              disabled={loading}
              title={
                checkedAt
                  ? `Last check ${formatRelativeTime(checkedAt)}. Re-check now`
                  : "Re-check just this ticker now"
              }
              aria-label={`Re-check ${c.ticker}`}
              className="relative text-muted-foreground after:absolute after:-inset-2 after:content-['']"
            >
              <RefreshCw className={cn(loading && "animate-spin")} />
            </Button>
          )}
        </div>
      </div>

      {c.inBook ? (
        <Scoreboard className="mt-4">
          <Score
            label="Price"
            value={currency(c.price)}
            sub={currency(c.currentValue)}
          />
          <Score
            label="Today"
            value={signedCurrency(c.todayDollar)}
            valueClassName={signedTone(c.todayDollar, "text-foreground")}
          />
          <Score
            label="Lifetime"
            value={percent(c.roiPct)}
            valueClassName={signedTone(c.roiPct, "text-foreground")}
          />
          <Score
            label="Portfolio"
            value={percent(c.bookPct)}
            sub={c.portfolios.length > 0 ? c.portfolios.join(", ") : undefined}
          />
        </Scoreboard>
      ) : (
        <p className="mt-3 text-sm tabular-nums text-muted-foreground">
          {currency(c.price)} - not in your portfolio
        </p>
      )}

      <PulseHistory ticker={c.ticker} />

      {hasBody ? (
        <div className="flex flex-col mt-6 gap-4 border-t border-border pt-4">
          {thesisBullets.length > 0 && (
            <Reading
              nested
              label={
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span>Thesis</span>
                  {onWriteThesis ? (
                    <button
                      type="button"
                      onClick={onWriteThesis}
                      className="text-sm font-medium text-muted-foreground hover:text-foreground"
                    >
                      {writtenThesis.length > 0 ? "Edit" : "Add yours"}
                    </button>
                  ) : null}
                </span>
              }
            >
              <ul className="flex flex-col gap-1.5">
                {thesisBullets.slice(0, 3).map((point, i) => (
                  <li key={i} className="flex gap-2">
                    <span
                      aria-hidden
                      className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    />
                    <span className="leading-snug">{point}</span>
                  </li>
                ))}
              </ul>
            </Reading>
          )}
          {suggestion ? (
            <p className="font-medium text-primary">{suggestion}</p>
          ) : null}
          {shown?.verdict &&
          !verdictRepeatsSuggestion(shown.verdict, shown) ? (
            <p className="text-base leading-relaxed text-foreground">
              {humanizeMargusText(shown.verdict)}
            </p>
          ) : null}
          {shown?.earningsNote ? (
            <p className="text-sm text-muted-foreground">{shown.earningsNote}</p>
          ) : null}
          {shown?.thesisBreak ? (
            <Reading nested label="Breaks if">{shown.thesisBreak}</Reading>
          ) : null}
        </div>
      ) : null}

      {headlines.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <MicroLabel>In the news</MicroLabel>
          <ul className="flex flex-col mt-2 gap-2">
            {headlines.slice(0, 2).map((h) => (
              <li key={h.link || h.title}>
                <a
                  href={h.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm leading-snug text-muted-foreground hover:text-foreground"
                >
                  {h.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function quoteForTicker(
  quotes: Record<string, Quote>,
  ticker: string
): Quote | null {
  const resolved = normalizeYahooTicker(ticker);
  return quotes[resolved] ?? quotes[ticker] ?? quotes[ticker.toUpperCase()] ?? null;
}

async function fetchQuote(
  ticker: string,
  signal?: AbortSignal
): Promise<Quote | null> {
  const resolved = normalizeYahooTicker(ticker);
  try {
    const res = await fetch(
      `/api/quotes?tickers=${encodeURIComponent(resolved)}`,
      { signal }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return quoteForTicker((data.quotes ?? {}) as Record<string, Quote>, resolved);
  } catch (err) {
    if (isAbortError(err)) return null;
    return null;
  }
}

async function resolveListedTicker(
  raw: string,
  signal?: AbortSignal
): Promise<string> {
  const query = raw.trim();
  const resolved = looksLikeTickerQuery(query)
    ? normalizeYahooTicker(query)
    : "";
  try {
    const res = await fetch(
      `/api/market/search?q=${encodeURIComponent(query)}`,
      { signal, cache: "no-store" }
    );
    if (!res.ok) return resolved || query.toUpperCase();
    const data = (await res.json()) as { results?: TickerSuggestion[] };
    const hit = pickTickerSuggestion(query, data.results ?? []);
    return hit?.symbol ? normalizeYahooTicker(hit.symbol) : resolved || query.toUpperCase();
  } catch (err) {
    if (isAbortError(err)) return resolved || query.toUpperCase();
    return resolved || query.toUpperCase();
  }
}

export const PulsePage = memo(function PulsePage({
  model,
  quotes,
  convictions,
  intentTicker,
  onIntentConsumed,
  onWriteThesis,
  onStamp,
}: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [pinnedTicker, setPinnedTicker] = useState<string | null>(null);
  const [lookupQuotes, setLookupQuotes] = useState<Record<string, Quote>>({});
  const searchRef = useRef<HTMLDivElement>(null);
  const remoteSuggestions = useTickerSearch(searchInput);

  // Dashboard passes onStamp as an inline arrow and re-renders on a 1s timer,
  // so its identity changes constantly. Depending on it directly would rebuild
  // the check callback (and re-fire the effect keyed off it) every second;
  // leaving it out of the deps would pin the very first closure and stamp
  // stale state. A ref refreshed every render gives a stable dependency and a
  // current callback at the same time.
  const onStampRef = useRef(onStamp);
  useEffect(() => {
    onStampRef.current = onStamp;
  }, [onStamp]);

  const mergedQuotes = useMemo(
    () => ({ ...quotes, ...lookupQuotes }),
    [quotes, lookupQuotes]
  );

  const bookTickers = useMemo(
    () => model.tickers.map((t) => t.ticker.toUpperCase()),
    [model.tickers]
  );

  const suggestions = useMemo(() => {
    const q = searchInput.trim();
    if (!q) return [];
    const stem = tickerStem(q.toUpperCase());
    const local = bookTickers
      .filter(
        (t) =>
          t.includes(q.toUpperCase()) ||
          tickerStem(t) === stem ||
          tickerStem(t).startsWith(stem)
      )
      .map((t) => ({ symbol: t, name: "in your portfolio" }));
    return mergeAndRankTickerSuggestions(q, local, remoteSuggestions, new Set());
  }, [bookTickers, remoteSuggestions, searchInput]);

  const candidates = useMemo(
    () => buildPulseCandidates(model, mergedQuotes),
    [model, mergedQuotes]
  );

  // Every check + its headlines, retained per ticker for good — never
  // cleared just because a background refresh is running or a new
  // calendar day started. Hydrated SYNCHRONOUSLY from localStorage in the
  // lazy initializer (not a useEffect) so the very first render already
  // has it: runPulse's mount effect fires in the same commit as
  // hydrateTicker's effect, so if hydration happened one tick later via
  // useEffect, runPulse would see these maps still empty, treat every
  // ticker as "never checked", and hit the network on every single mount
  // regardless of how fresh the cache actually was.
  const [checksByTicker, setChecksByTicker] = useState<
    Record<string, PulseCheck>
  >(() => {
    const out: Record<string, PulseCheck> = {};
    for (const c of candidates) {
      const cached = loadPulseTickerCache(c.ticker);
      if (cached) out[c.ticker.toUpperCase()] = cached.check;
    }
    return out;
  });
  const [headlinesByTicker, setHeadlinesByTicker] = useState<
    Record<string, PulseHeadline[]>
  >(() => {
    const out: Record<string, PulseHeadline[]> = {};
    for (const c of candidates) {
      const cached = loadPulseTickerCache(c.ticker);
      if (cached) out[c.ticker.toUpperCase()] = cached.headlines;
    }
    return out;
  });
  const [checkedAtByTicker, setCheckedAtByTicker] = useState<
    Record<string, string>
  >(() => {
    const out: Record<string, string> = {};
    for (const c of candidates) {
      const cached = loadPulseTickerCache(c.ticker);
      if (cached) out[c.ticker.toUpperCase()] = cached.cachedAt;
    }
    return out;
  });
  const [checkingTickers, setCheckingTickers] = useState<Set<string>>(
    new Set()
  );
  const [, setSummary] = useState("");
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fearGreed, setFearGreed] = useState<FearGreedSnapshot | null>(null);

  // Belt-and-suspenders against the same stale-closure class of bug the
  // lazy initializers above just fixed: if candidates ever go from empty
  // to populated across a render (data arriving after mount), the
  // hydrate-cache effect and the runPulse-trigger effect below both fire
  // in the same commit, in declaration order — a ref always reflects the
  // latest value regardless of that ordering, a plain state closure
  // wouldn't.
  const checkedAtByTickerRef = useRef(checkedAtByTicker);
  checkedAtByTickerRef.current = checkedAtByTicker;

  const hydrateTicker = useCallback((ticker: string) => {
    const key = ticker.trim().toUpperCase();
    const cached = loadPulseTickerCache(key);
    if (!cached) return;
    setChecksByTicker((prev) =>
      prev[key] ? prev : { ...prev, [key]: reconcilePulseCheck(cached.check) }
    );
    setHeadlinesByTicker((prev) =>
      prev[key] ? prev : { ...prev, [key]: cached.headlines }
    );
    setCheckedAtByTicker((prev) =>
      prev[key] ? prev : { ...prev, [key]: cached.cachedAt }
    );
  }, []);

  const pinnedCandidate = useMemo(() => {
    if (!pinnedTicker) return null;
    return buildPulseCandidate(pinnedTicker, model, mergedQuotes);
  }, [pinnedTicker, model, mergedQuotes]);

  const leftHoldTickers = useMemo(() => {
    const left = new Set<string>();
    for (const c of candidates) {
      const key = c.ticker.toUpperCase();
      if (pulseLeftHold(checksByTicker[key]?.action, loadPulseHistory(key))) {
        left.add(key);
      }
    }
    if (pinnedTicker) {
      const key = pinnedTicker.toUpperCase();
      if (pulseLeftHold(checksByTicker[key]?.action, loadPulseHistory(key))) {
        left.add(key);
      }
    }
    return left;
  }, [candidates, checksByTicker, pinnedTicker]);

  const ranked = useMemo(
    () => sortPulseCandidates(candidates, { leftHoldTickers }),
    [candidates, leftHoldTickers]
  );

  const attention = useMemo(
    () =>
      ranked.filter((c) => {
        const key = c.ticker.toUpperCase();
        return (
          key !== pinnedTicker &&
          (c.isBigMove || leftHoldTickers.has(key))
        );
      }),
    [ranked, pinnedTicker, leftHoldTickers]
  );
  const rest = useMemo(
    () =>
      ranked.filter((c) => {
        const key = c.ticker.toUpperCase();
        return (
          key !== pinnedTicker &&
          !c.isBigMove &&
          !leftHoldTickers.has(key)
        );
      }),
    [ranked, pinnedTicker, leftHoldTickers]
  );

  const scanRows = useMemo(
    () =>
      buildPulseScan(
        ranked.map((c) => {
          const key = c.ticker.toUpperCase();
          return {
            ticker: key,
            isBigMove: c.isBigMove,
            leftHold: leftHoldTickers.has(key),
            effectivePct: c.effectivePct,
            moveLabel: c.moveLabel,
            check: checksByTicker[key],
            headline: headlinesByTicker[key]?.[0]?.title ?? null,
            bookPct: c.bookPct,
            price: c.price,
          };
        })
      ),
    [ranked, leftHoldTickers, checksByTicker, headlinesByTicker]
  );

  useEffect(() => {
    for (const c of candidates) hydrateTicker(c.ticker);
  }, [candidates, hydrateTicker]);

  useLayoutEffect(() => {
    const cached = loadPulseSummary();
    if (cached) setSummary(humanizeMargusText(cached.summary));
    const fg = loadFearGreedPaint();
    if (fg) setFearGreed(fg);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetch("/api/market/fear-greed", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!ctrl.signal.aborted && data?.score != null) {
          const fg = data as FearGreedSnapshot;
          setFearGreed(fg);
          saveMacroPaint({
            macro: loadMacroPaint()?.macro ?? {
              vix: null,
              eurusd: null,
              btc: null,
              tenYear: null,
            },
            fearGreed: fg,
          });
        }
      })
      .catch((err) => {
        if (isAbortError(err)) return;
      });
    return () => {
      ctrl.abort();
    };
  }, []);

  useEffect(() => {
    if (!pinnedTicker) return;
    const t = window.setTimeout(() => {
      document
        .getElementById(`pulse-card-${pinnedTicker}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [pinnedTicker, checkingTickers]);

  // Synchronous in-flight guard — a Pulse LLM call can take 40+ seconds,
  // and `candidates` gets a new array reference every time quotes refresh
  // (~45s) or fear-greed loads, which was re-firing the mount effect mid-
  // request and launching duplicate overlapping batch calls for the same
  // tickers (visible server-side as concurrent 40–46s POSTs, one of which
  // then gets its response aborted). `checkingTickers` state is async/
  // batched and not safe to read-then-write inside the same tick for this;
  // a ref updates immediately so a near-simultaneous second call always
  // sees the first call's claim.
  const inFlightRef = useRef<Set<string>>(new Set());
  const pageAbortRef = useRef(new AbortController());
  useEffect(() => {
    const ctrl = pageAbortRef.current;
    return () => ctrl.abort();
  }, []);

  /**
   * Checks a set of tickers in one request. Auto only covers a name that
   * was never checked, or a 5% mover whose last read is stale.
   * Tickers being refreshed keep showing their old result.
   */
  const runPulse = useCallback(
    async (targets: PulseCandidate[], opts?: { force?: boolean; signal?: AbortSignal }) => {
      if (targets.length === 0) return;
      const force = opts?.force ?? false;
      const notInFlight = targets.filter(
        (c) => !inFlightRef.current.has(c.ticker.toUpperCase())
      );
      const stale = force
        ? notInFlight
        : notInFlight.filter((c) =>
            shouldAutoPulseTicker({
              needsAttention: c.isBigMove,
              cachedAt:
                checkedAtByTickerRef.current[c.ticker.toUpperCase()] ?? "",
            })
          );
      if (stale.length === 0) return;
      if (force) track("thesis_pulse_refresh", { tickers: stale.length });

      const staleKeys = stale.map((c) => c.ticker.toUpperCase());
      for (const key of staleKeys) inFlightRef.current.add(key);
      setCheckingTickers((prev) => new Set([...prev, ...staleKeys]));
      setError(null);
      try {
        const convictionPayload: Record<
          string,
          { thesis?: string; level?: number }
        > = {};
        for (const c of stale) {
          const entry = convictions[c.ticker.toUpperCase()];
          if (entry) {
            convictionPayload[c.ticker.toUpperCase()] = {
              thesis: entry.thesis,
              level: entry.level,
            };
          }
        }

        const res = await fetch("/api/thesis/pulse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidates: stale,
            convictions: convictionPayload,
            fearGreed,
            force,
          }),
          signal: opts?.signal,
        });
        if (opts?.signal?.aborted) return;
        const data = await readJsonOrThrow<{
          report: PulseReport;
          headlines?: Record<string, PulseHeadline[]>;
          reused?: boolean;
        }>(res, "Pulse check failed");
        if (opts?.signal?.aborted) return;
        const newReport = data.report as PulseReport;
        const newHeadlines =
          (data.headlines as Record<string, PulseHeadline[]>) ?? {};
        const reused = Boolean(data.reused);
        const now = new Date().toISOString();

        setChecksByTicker((prev) => {
          const next = { ...prev };
          for (const check of newReport.checks ?? []) {
            const reconciled = reconcilePulseCheck(check);
            next[reconciled.ticker] = reconciled;
          }
          return next;
        });
        setHeadlinesByTicker((prev) => ({ ...prev, ...newHeadlines }));
        if (reused) {
          setCheckedAtByTicker((prev) => {
            const next = { ...prev };
            for (const check of newReport.checks ?? []) {
              const key = reconcilePulseCheck(check).ticker;
              if (!next[key]) next[key] = now;
            }
            return next;
          });
          for (const check of newReport.checks ?? []) {
            const reconciled = reconcilePulseCheck(check);
            const key = reconciled.ticker;
            const cachedAt =
              checkedAtByTickerRef.current[key] ?? now;
            savePulseTickerCache(key, {
              check: reconciled,
              headlines: newHeadlines[key] ?? [],
              cachedAt,
            });
          }
          if (newReport.summary?.trim()) {
            setSummary((prev) => prev || newReport.summary);
          }
          return;
        }
        setCheckedAtByTicker((prev) => {
          const next = { ...prev };
          for (const check of newReport.checks ?? []) {
            next[reconcilePulseCheck(check).ticker] = now;
          }
          return next;
        });
        for (const check of newReport.checks ?? []) {
          const reconciled = reconcilePulseCheck(check);
          const key = reconciled.ticker;
          savePulseTickerCache(key, {
            check: reconciled,
            headlines: newHeadlines[key] ?? [],
            cachedAt: now,
          });
          recordPulseHistory(reconciled, now);
          onStampRef.current?.(key, {
            at: now,
            verdict: statusLabel(reconciled.thesisStatus),
            line:
              reconciled.verdict?.trim() ||
              reconciled.thesisBreak?.trim() ||
              actionLabel(reconciled.action),
            action: reconciled.action,
            thesisStatus: reconciled.thesisStatus,
          });
        }
        if (newReport.summary?.trim()) {
          setSummary(newReport.summary);
          savePulseSummary(newReport.summary);
        }
        setLastGeneratedAt(now);
      } catch (err) {
        if (isAbortError(err)) return;
        setError(
          err instanceof Error && err.message.trim()
            ? err.message
            : "Pulse check failed"
        );
      } finally {
        for (const key of staleKeys) inFlightRef.current.delete(key);
        setCheckingTickers((prev) => {
          const next = new Set(prev);
          for (const key of staleKeys) next.delete(key);
          return next;
        });
      }
    },
    [convictions, fearGreed]
  );

  // Keyed off the ticker SET, not the `candidates` array's object identity
  // — quotes refresh every ~45s and rebuild `candidates` fresh each time,
  // which would otherwise re-fire this effect constantly even though the
  // underlying tickers never changed.
  const candidateSetKey = candidates
    .map((c) => c.ticker.toUpperCase())
    .sort()
    .join(",");

  // First paint + whenever the candidate SET actually changes: fill in
  // names that were never checked, or a 5% mover whose last read
  // is stale. Quiet names keep the last read. Check again is the override.
  useEffect(() => {
    if (candidates.length === 0) return;
    const ctrl = new AbortController();
    void runPulse(candidates, { signal: ctrl.signal });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed off the stable ticker-set signature, not candidates/runPulse identity churn
  }, [candidateSetKey]);

  async function checkTicker(tickerRaw: string) {
    const typed = sanitizeTickerQuery(tickerRaw).trim();
    if (!typed) return;
    setSearchInput("");
    setError(null);

    const named = looksLikeTickerQuery(typed)
      ? null
      : pickTickerSuggestion(typed, suggestions);
    let ticker = named?.symbol
      ? normalizeYahooTicker(named.symbol)
      : looksLikeTickerQuery(typed)
        ? normalizeYahooTicker(typed)
        : "";
    if (ticker) {
      setPinnedTicker(ticker);
      hydrateTicker(ticker);
    }

    let quoteMap = mergedQuotes;
    let q = ticker ? quoteForTicker(quoteMap, ticker) : null;
    if (ticker && !q) {
      q = await fetchQuote(ticker, pageAbortRef.current.signal);
    }
    if (!q) {
      ticker = await resolveListedTicker(typed, pageAbortRef.current.signal);
      setPinnedTicker(ticker);
      hydrateTicker(ticker);
      q = quoteForTicker(quoteMap, ticker) ??
        (await fetchQuote(ticker, pageAbortRef.current.signal));
    }
    if (!q) {
      const label = looksLikeTickerQuery(typed) ? cashtag(typed) : typed;
      setError(`Couldn't get a price for ${label}. Try the ticker or the company name.`);
      return;
    }

    setLookupQuotes((prev) => ({ ...prev, [ticker]: q, [typed]: q }));
    quoteMap = { ...quoteMap, [ticker]: q, [typed]: q };

    const candidate = buildPulseCandidate(ticker, model, quoteMap);
    await runPulse([candidate], {
      force: true,
      signal: pageAbortRef.current.signal,
    });
  }

  useEffect(() => {
    if (!intentTicker) return;
    const ticker = intentTicker;
    onIntentConsumed?.();
    void checkTicker(ticker);
    // Consume once when Home hands us a name. checkTicker is recreated
    // every render, so it stays out of the deps on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentTicker]);

  async function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    await checkTicker(searchInput);
  }

  const pinnedLoading = Boolean(
    pinnedTicker && checkingTickers.has(pinnedTicker)
  );

  return (
    <div className="flex flex-col gap-6">
      <Panel className="gap-3">
        <PanelHeader
          icon={<Activity className="h-4 w-4" />}
          title="Should you sell, or buy more?"
          actions={
            <form
              onSubmit={(e) => void submitSearch(e)}
              className="flex w-full items-center gap-1.5 sm:w-[22rem]"
            >
              <div ref={searchRef} className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(sanitizeTickerQuery(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && suggestions[0]) {
                      e.preventDefault();
                      void checkTicker(suggestions[0]!.symbol);
                    }
                  }}
                  placeholder="NVDA, Apple, or SPY5"
                  aria-label="Ticker or company name to check"
                  className="pl-8"
                  autoComplete="off"
                />
                {suggestions.length > 0 && searchInput.trim().length > 0 && (
                  <ul className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-muted shadow-sm">
                    {suggestions.map((row) => (
                      <li key={row.symbol}>
                        <button
                          type="button"
                          className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                          onClick={() => void checkTicker(row.symbol)}
                        >
                          <span className="font-medium">{cashtag(row.symbol)}</span>
                          {row.name && (
                            <span className="truncate text-muted-foreground">{row.name}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Button
                type="submit"
                disabled={!searchInput.trim() || pinnedLoading}
                className="shrink-0"
              >
                {pinnedLoading ? "Checking …" : "Check"}
              </Button>
            </form>
          }
        />

        {pinnedTicker && (
          <Badge variant="secondary" className="h-8 w-fit gap-1.5 pr-1">
            {cashtag(pinnedTicker)}
            <button
              type="button"
              onClick={() => setPinnedTicker(null)}
              className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              aria-label="Clear pinned ticker"
            >
              <X className="size-3" />
            </button>
          </Badge>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-sm text-loss">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </div>
        )}
      </Panel>

        {scanRows.length > 0 && !pinnedTicker && (
        <ScanList
          label="Today's scan"
          rows={scanRows.map((row) => {
            const key = row.ticker.toUpperCase();
            const candidate = ranked.find(
              (c) => c.ticker.toUpperCase() === key
            );
            return {
              ticker: row.ticker,
              text: scanLineBody(row.ticker, humanizeMargusText(row.line)),
              movePct: candidate?.effectivePct,
            };
          })}
          onOpen={(ticker) => {
            document
              .getElementById(`pulse-card-${ticker}`)
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      )}

      {pinnedCandidate && (
        <section>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            The one you asked about
          </h3>
          <ul className="flex flex-col gap-4">
            <PulseCard
              candidate={pinnedCandidate}
              check={checksByTicker[pinnedCandidate.ticker.toUpperCase()]}
              headlines={
                headlinesByTicker[pinnedCandidate.ticker.toUpperCase()] ?? []
              }
              loading={pinnedLoading}
              convictionThesis={
                convictions[pinnedCandidate.ticker.toUpperCase()]?.thesis
              }
              checkedAt={checkedAtByTicker[pinnedCandidate.ticker.toUpperCase()]}
              onRefresh={() => void runPulse([pinnedCandidate], { force: true })}
              onWriteThesis={
                onWriteThesis
                  ? () => onWriteThesis(pinnedCandidate.ticker)
                  : undefined
              }
              pinned
              leftHold={leftHoldTickers.has(
                pinnedCandidate.ticker.toUpperCase()
              )}
            />
          </ul>
        </section>
      )}

      {candidates.length === 0 && !pinnedCandidate ? (
        <EmptyState
          title="Nothing to check yet"
          detail="Add a holding and Pulse starts watching it automatically. You can also type any ticker above for a one-off look."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {attention.length > 0 && (
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-caution"
                  aria-hidden
                />
                Needs a look
              </h3>
              <ul className="flex flex-col gap-4">
                {attention.map((c) => (
                  <PulseCard
                    key={c.ticker}
                    candidate={c}
                    check={checksByTicker[c.ticker.toUpperCase()]}
                    headlines={headlinesByTicker[c.ticker.toUpperCase()] ?? []}
                    loading={checkingTickers.has(c.ticker.toUpperCase())}
                    convictionThesis={
                      convictions[c.ticker.toUpperCase()]?.thesis
                    }
                    checkedAt={checkedAtByTicker[c.ticker.toUpperCase()]}
                    onRefresh={() => void runPulse([c], { force: true })}
                    onWriteThesis={
                      onWriteThesis ? () => onWriteThesis(c.ticker) : undefined
                    }
                    leftHold={leftHoldTickers.has(c.ticker.toUpperCase())}
                    needsLook
                  />
                ))}
              </ul>
            </section>
          )}

          {rest.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                {attention.length > 0
                  ? "Everything else"
                  : `Your ${plural(rest.length, "biggest holding")}`}
              </h3>
              <ul className="flex flex-col gap-4">
                {rest.map((c) => (
                  <PulseCard
                    key={c.ticker}
                    candidate={c}
                    check={checksByTicker[c.ticker.toUpperCase()]}
                    headlines={headlinesByTicker[c.ticker.toUpperCase()] ?? []}
                    loading={checkingTickers.has(c.ticker.toUpperCase())}
                    convictionThesis={
                      convictions[c.ticker.toUpperCase()]?.thesis
                    }
                    checkedAt={checkedAtByTicker[c.ticker.toUpperCase()]}
                    onRefresh={() => void runPulse([c], { force: true })}
                    onWriteThesis={
                      onWriteThesis ? () => onWriteThesis(c.ticker) : undefined
                    }
                    leftHold={leftHoldTickers.has(c.ticker.toUpperCase())}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {lastGeneratedAt && (
        <p className="text-center text-sm text-muted-foreground">
          Last checked{" "}
          {new Date(lastGeneratedAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      )}
    </div>
  );
});
