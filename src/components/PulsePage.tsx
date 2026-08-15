"use client";

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
  Card,
  EmptyState,
  MicroLabel,
  Panel,
  PanelHeader,
  Stat,
} from "@/components/ui/Panel";
import type { ConvictionMap } from "@/lib/conviction";
import type { FearGreedSnapshot } from "@/lib/market/fear-greed";
import { fearGreedTone } from "@/lib/market/fear-greed";
import { humanizeMargusText } from "@/lib/ai/humanize-copy";
import { isAbortError } from "@/lib/abort";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { readJsonOrThrow } from "@/lib/http";
import type { OverviewModel } from "@/lib/overview";
import { formatRelativeTime } from "@/lib/timezone";
import type { Quote } from "@/lib/types";
import {
  buildPulseCandidate,
  buildPulseCandidates,
  formatMovePct,
  pulseLeftHold,
  shouldAutoPulseTicker,
  sortPulseCandidates,
  buildPulseScan,
  loadPulseSummary,
  loadPulseTickerCache,
  reconcilePulseCheck,
  savePulseSummary,
  savePulseTickerCache,
  statusLabel,
  actionLabel,
  normalizePulseSituation,
  verdictRepeatsTrim,
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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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
    <p className="mt-2 text-xs text-zinc-500">
      Last time: {actionLabel(prior.action)}, {statusLabel(prior.thesisStatus)}
    </p>
  );
}

function thesisDisplayBullets(text: string | undefined): string[] {
  const sentences = normalizePulseSituation(text ?? "");
  if (sentences.length > 0) return sentences.slice(0, 6);
  return fundCopyBullets(text);
}

function StatusIcon({ status }: { status: ThesisStatus }) {
  if (status === "watch") return <Eye className="h-4 w-4 text-amber-400" />;
  if (status === "broken") return <XCircle className="h-4 w-4 text-rose-400" />;
  return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
}

function ActionBadge({ action }: { action: PulseAction }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
        action === "add" &&
          "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
        action === "hold" &&
          "border-zinc-600/80 bg-zinc-900/60 text-zinc-300",
        // Trim is disciplined profit-taking on a winner, not a warning, so
        // it deliberately doesn't share the rose alarm color with Sell —
        // that overlap is what made "Trim" and "Thesis at risk" look like
        // the same kind of bad news.
        action === "trim" &&
          "border-violet-400/40 bg-violet-500/15 text-violet-200",
        action === "sell" &&
          "border-rose-500/40 bg-rose-500/15 text-rose-200",
        action === "watch" &&
          "border-amber-500/40 bg-amber-500/15 text-amber-200"
      )}
    >
      {actionLabel(action)}
    </span>
  );
}

function statusBorder(status: ThesisStatus, urgent: boolean, pinned: boolean) {
  if (pinned) return "border-brand/50 bg-brand/10 ring-1 ring-brand/30";
  if (urgent && status !== "intact") {
    return "border-rose-500/40 bg-rose-950/25";
  }
  if (status === "intact") return "border-emerald-500/30 bg-emerald-950/20";
  if (status === "watch") return "border-amber-500/30 bg-amber-950/15";
  return "border-rose-500/30 bg-rose-950/20";
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

  return (
    <li
      id={`pulse-card-${c.ticker}`}
      className={cn(
        "rounded-xl border px-4 py-4 scroll-mt-28",
        shown
          ? statusBorder(status, c.isBigMove || leftHold, pinned)
          : pinned
            ? "border-brand/50 bg-brand/10 ring-1 ring-brand/30"
            : "border-zinc-800 bg-zinc-950/40"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-base font-semibold text-white">
              {cashtag(c.ticker)}
            </span>
            {pinned && (
              <span className="rounded bg-brand/20 px-1.5 py-0.5 text-xs font-medium text-brand-bright">
                Your check
              </span>
            )}
            {!c.inBook && (
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                Lookup
              </span>
            )}
            {leftHold && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-200">
                Was Hold
              </span>
            )}
            {c.isBigMove && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs font-medium",
                  (c.effectivePct ?? 0) < 0
                    ? "bg-rose-500/20 text-rose-200"
                    : "bg-emerald-500/20 text-emerald-200"
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
            <span className="font-normal text-zinc-400">{c.moveLabel}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {shown ? (
            <>
              <ActionBadge action={action} />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-950/50 px-2.5 py-1 text-xs font-medium text-zinc-200">
                <StatusIcon status={status} />
                {statusLabel(status)}
              </span>
            </>
          ) : loading ? (
            <span className="text-xs text-zinc-400">Checking …</span>
          ) : null}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              title={
                checkedAt
                  ? `Last check ${formatRelativeTime(checkedAt)}. Re-check now`
                  : "Re-check just this ticker now"
              }
              aria-label={`Re-check ${c.ticker}`}
              className="relative rounded-full border border-zinc-700/80 bg-zinc-950/50 p-1.5 text-zinc-400 transition after:absolute after:-inset-2 after:content-[''] hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-40"
            >
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            </button>
          )}
        </div>
      </div>

      {c.inBook ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Price"
            value={currency(c.price)}
            sub={currency(c.currentValue)}
          />
          <Stat
            label="Today"
            value={signedCurrency(c.todayDollar)}
            valueClassName={signedTone(c.todayDollar, "text-zinc-100")}
          />
          <Stat
            label="Lifetime"
            value={percent(c.roiPct)}
            valueClassName={signedTone(c.roiPct, "text-zinc-100")}
          />
          <Stat
            label="Book"
            value={percent(c.bookPct)}
            sub={c.portfolios.length > 0 ? c.portfolios.join(", ") : undefined}
          />
        </div>
      ) : (
        <p className="mt-2 text-xs tabular-nums text-zinc-500">
          {currency(c.price)} · not in your book
        </p>
      )}

      <PulseHistory ticker={c.ticker} />

      <div className="mt-4 space-y-3 border-t border-zinc-800/60 pt-3 text-sm leading-relaxed text-zinc-300">
        {thesisBullets.length > 0 && (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <MicroLabel>Thesis</MicroLabel>
              {onWriteThesis && (
                <button
                  type="button"
                  onClick={onWriteThesis}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  {writtenThesis.length > 0 ? "Edit" : "Add yours"}
                </button>
              )}
            </div>
            <ul className="mt-1.5 space-y-1.5 text-zinc-100">
              {thesisBullets.slice(0, 3).map((point, i) => (
                <li key={i} className="flex gap-2">
                  <span
                    aria-hidden
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-bright"
                  />
                  <span className="leading-snug">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {shown?.action === "trim" && shown.trimPct ? (
          <p className="font-medium text-violet-200">
            Trim about {shown.trimPct}% into this strength.
          </p>
        ) : null}
        {shown?.addLevel ? (
          <p className="font-medium text-brand-bright">{shown.addLevel}</p>
        ) : null}
        {shown?.verdict &&
        !verdictRepeatsTrim(shown.verdict, shown.trimPct) ? (
          <p className="text-zinc-100">{shown.verdict}</p>
        ) : null}
        {shown?.earningsNote ? (
          <p className="text-xs text-zinc-400">{shown.earningsNote}</p>
        ) : null}
        {shown?.thesisBreak ? (
          <div>
            <MicroLabel>Breaks if</MicroLabel>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">
              {shown.thesisBreak}
            </p>
          </div>
        ) : null}
      </div>

      {headlines.length > 0 && (
        <div className="mt-4 border-t border-zinc-800/60 pt-3">
          <MicroLabel>In the news</MicroLabel>
          <ul className="mt-1.5 space-y-1">
            {headlines.slice(0, 2).map((h) => (
              <li key={h.link || h.title}>
                <a
                  href={h.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs leading-snug text-zinc-500 hover:text-brand-bright"
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

async function fetchQuote(
  ticker: string,
  signal?: AbortSignal
): Promise<Quote | null> {
  try {
    const res = await fetch(
      `/api/quotes?tickers=${encodeURIComponent(ticker)}`,
      { signal }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.quotes?.[ticker] as Quote | undefined) ?? null;
  } catch (err) {
    if (isAbortError(err)) return null;
    return null;
  }
}

export function PulsePage({
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
    const q = searchInput.trim().toUpperCase();
    if (!q) return [];
    return bookTickers.filter((t) => t.includes(q)).slice(0, 8);
  }, [bookTickers, searchInput]);

  const candidates = useMemo(
    () => buildPulseCandidates(model, mergedQuotes),
    [model, mergedQuotes]
  );

  const skippedTickers = useMemo(() => {
    const checked = new Set(candidates.map((c) => c.ticker.toUpperCase()));
    return model.tickers
      .filter((t) => !checked.has(t.ticker.toUpperCase()))
      .map((t) => t.ticker);
  }, [candidates, model.tickers]);

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
  const [summary, setSummary] = useState("");
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
      prev[key] ? prev : { ...prev, [key]: cached.check }
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
          };
        })
      ),
    [ranked, leftHoldTickers, checksByTicker]
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
            next[check.ticker.toUpperCase()] = reconcilePulseCheck(check);
          }
          return next;
        });
        setHeadlinesByTicker((prev) => ({ ...prev, ...newHeadlines }));
        if (reused) {
          setCheckedAtByTicker((prev) => {
            const next = { ...prev };
            for (const check of newReport.checks ?? []) {
              const key = check.ticker.toUpperCase();
              if (!next[key]) next[key] = now;
            }
            return next;
          });
          for (const check of newReport.checks ?? []) {
            const key = check.ticker.toUpperCase();
            const reconciled = reconcilePulseCheck(check);
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
            next[check.ticker.toUpperCase()] = now;
          }
          return next;
        });
        for (const check of newReport.checks ?? []) {
          const key = check.ticker.toUpperCase();
          const reconciled = reconcilePulseCheck(check);
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
    const ticker = tickerRaw.trim().toUpperCase();
    if (!ticker) return;
    setSearchInput("");
    setPinnedTicker(ticker);
    setError(null);
    hydrateTicker(ticker);

    let quoteMap = mergedQuotes;
    if (!quoteMap[ticker]) {
      const q = await fetchQuote(ticker, pageAbortRef.current.signal);
      if (q) {
        setLookupQuotes((prev) => ({ ...prev, [ticker]: q }));
        quoteMap = { ...quoteMap, [ticker]: q };
      } else {
        setError(`Couldn't get a price for ${cashtag(ticker)}. Check the ticker.`);
        return;
      }
    }

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
    <div className="space-y-8">
      <Panel>
        <PanelHeader
          hero
          icon={<Activity className="h-4 w-4" />}
          title="Should you sell, or buy more?"
        />
        <p className="mt-2 text-xs text-zinc-500">{ADVICE_DISCLAIMER_SHORT}</p>

        <form onSubmit={(e) => void submitSearch(e)} className="mt-5 flex flex-col gap-2 sm:flex-row">
          <div ref={searchRef} className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && suggestions[0]) {
                  e.preventDefault();
                  void checkTicker(suggestions[0]!);
                }
              }}
              placeholder="Check any ticker: NVDA, RKLB, BMNR …"
              aria-label="Ticker to check"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 py-2 pl-8 pr-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-brand/50"
              autoComplete="off"
            />
            {suggestions.length > 0 && searchInput.trim().length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl">
                {suggestions.map((t) => (
                  <li key={t}>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900"
                      onClick={() => void checkTicker(t)}
                    >
                      {t}
                      <span className="ml-2 text-xs text-zinc-400">in book</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="submit"
            disabled={!searchInput.trim() || pinnedLoading}
              className="btn-primary w-full shrink-0 px-3 text-xs disabled:opacity-40 sm:w-auto sm:py-2"
          >
            {pinnedLoading ? "Checking …" : "Check"}
          </button>
        </form>

        {pinnedTicker && (
          <div className="mt-2 flex items-center gap-2 text-xs text-brand-bright">
            <span>Pinned: {pinnedTicker}</span>
            <button
              type="button"
              onClick={() => setPinnedTicker(null)}
              className="inline-flex items-center gap-0.5 text-zinc-400 hover:text-zinc-300"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          </div>
        )}

        {(fearGreed || skippedTickers.length > 0) && (
          <p
            className="mt-3 text-xs text-zinc-400"
            title="A widely watched gauge of how nervous or confident the market is overall. 0 is panic, 100 is euphoria."
          >
            {fearGreed && (
              <>
                Market mood:{" "}
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    fearGreedTone(fearGreed.score) === "fear" && "text-sky-300",
                    fearGreedTone(fearGreed.score) === "neutral" && "text-zinc-300",
                    fearGreedTone(fearGreed.score) === "greed" && "text-amber-300"
                  )}
                >
                  {fearGreed.rating.toLowerCase()}
                </span>
                {", "}
                <span className="tabular-nums">{fearGreed.score} of 100</span>
              </>
            )}
            {fearGreed && skippedTickers.length > 0 ? ". " : ""}
            {skippedTickers.length > 0 && (
              <>
                Skipping{" "}
                {skippedTickers.map((t) => cashtag(t)).join(", ")}
                {" "}
                (quiet, under 5%)
              </>
            )}
            .
          </p>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </div>
        )}
      </Panel>

      {scanRows.length > 0 && !pinnedTicker && (
        <Card>
          <MicroLabel>Today&apos;s scan</MicroLabel>
          <ul className="mt-2 space-y-2">
            {scanRows.map((row) => (
              <li
                key={row.ticker}
                className="text-sm leading-relaxed text-zinc-100"
              >
                {humanizeMargusText(row.line)}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pinnedCandidate && (
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-brand-bright">
            The one you asked about
          </h3>
          <ul className="space-y-3">
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
        <div className="space-y-6">
          {attention.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-200">
                Needs a look
              </h3>
              <ul className="space-y-3">
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
                  />
                ))}
              </ul>
            </section>
          )}

          {rest.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
                {attention.length > 0
                  ? "Everything else"
                  : `Your ${plural(rest.length, "biggest holding")}`}
              </h3>
              <ul className="space-y-3">
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
        <p className="text-center text-xs text-zinc-400">
          Last checked{" "}
          {new Date(lastGeneratedAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      )}
    </div>
  );
}
