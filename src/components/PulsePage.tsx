"use client";

import { track } from "@vercel/analytics";
import {
  currency,
  percent,
  signedCurrency,
  cn,
  plural,
  signedTone,  cashtag,
} from "@/lib/format";
import type { ConvictionMap } from "@/lib/conviction";
import type { FearGreedSnapshot } from "@/lib/market/fear-greed";
import { fearGreedTone } from "@/lib/market/fear-greed";
import { ADVICE_DISCLAIMER_LONG } from "@/lib/disclaimer";
import { readJsonOrThrow } from "@/lib/http";
import type { OverviewModel } from "@/lib/overview";
import { formatRelativeTime } from "@/lib/timezone";
import type { Quote } from "@/lib/types";
import {
  PULSE_DOWN_THRESHOLD,
  PULSE_REFRESH_MS,
  buildPulseCandidate,
  buildPulseCandidates,
  formatMovePct,
  isPulseCacheFresh,
  loadPulseSummary,
  loadPulseTickerCache,
  savePulseSummary,
  savePulseTickerCache,
  statusLabel,
  actionLabel,
  type PulseAction,
  type PulseCheck,
  type PulseHeadline,
  type PulseReport,
  type PulseCandidate,
  type ThesisStatus,
} from "@/lib/thesis-pulse";
import {
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  model: OverviewModel;
  quotes: Record<string, Quote>;
  convictions: ConvictionMap;
};

function StatusIcon({ status }: { status: ThesisStatus }) {
  if (status === "intact")
    return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "watch") return <Eye className="h-4 w-4 text-amber-400" />;
  return <XCircle className="h-4 w-4 text-rose-400" />;
}

function ActionBadge({ action }: { action: PulseAction }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
        action === "add" &&
          "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
        action === "hold" &&
          "border-zinc-600/80 bg-zinc-900/60 text-zinc-300",
        action === "trim" &&
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
  pinned = false,
}: {
  candidate: PulseCandidate;
  check?: PulseCheck;
  headlines: PulseHeadline[];
  loading: boolean;
  convictionThesis?: string;
  checkedAt?: string;
  onRefresh?: () => void;
  pinned?: boolean;
}) {
  const pct = c.effectivePct ?? 0;
  const up = pct >= 0;
  const status = check?.thesisStatus ?? (c.needsAttention ? "watch" : "intact");
  const action = check?.action;

  return (
    <li
      id={`pulse-card-${c.ticker}`}
      className={cn(
        "rounded-xl border px-4 py-4 scroll-mt-28",
        check
          ? statusBorder(status, c.needsAttention, pinned)
          : pinned
            ? "border-brand/50 bg-brand/10 ring-1 ring-brand/30"
            : c.needsAttention
              ? "border-rose-500/30 bg-rose-950/15"
              : "border-zinc-800 bg-[#161618]/60"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-white">{cashtag(c.ticker)}</span>
            {pinned && (
              <span className="rounded bg-brand/20 px-1.5 py-0.5 text-[11px] font-medium text-brand-bright">
                Your check
              </span>
            )}
            {!c.inBook && (
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
                Lookup
              </span>
            )}
            {c.needsAttention && (
              <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[11px] font-medium text-rose-200">
                Down ≥5%
              </span>
            )}
            <span
              className={cn(
                "inline-flex items-center gap-1 text-sm font-medium tabular-nums",
                up ? "text-gain" : "text-loss"
              )}
            >
              {up ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              {formatMovePct(c.effectivePct)}
            </span>
            <span className="text-xs text-zinc-500">{c.moveLabel}</span>
            {loading && check && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500"
                title="Refreshing in the background. This result stays on screen until the new one lands"
              >
                <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                Updating
              </span>
            )}
          </div>
          {c.inBook ? (
            <p className="mt-0.5 text-xs text-zinc-500">
              {currency(c.price)} · {percent(c.bookPct)} of book ·{" "}
              {currency(c.currentValue)} ·{" "}
              <span className={signedTone(c.todayDollar, "text-zinc-500")}>
                {signedCurrency(c.todayDollar)}
              </span>{" "}
              today · lifetime{" "}
              <span className={signedTone(c.roiPct, "text-zinc-500")}>
                {percent(c.roiPct)}
              </span>{" "}
              · {c.portfolios.join(", ")}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-zinc-500">
              {currency(c.price)} · not in your book
            </p>
          )}
        </div>
        {check && (
          <div className="flex flex-wrap items-center gap-1.5">
            {action && <ActionBadge action={action} />}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-950/50 px-2.5 py-1 text-[11px] font-medium text-zinc-200">
              <StatusIcon status={status} />
              {statusLabel(status)}
            </span>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                title="Re-check just this ticker now"
                aria-label={`Re-check ${c.ticker}`}
                // Pill sits in a dense wrap row, so grow the hit area with
                // a pseudo-element instead of a 44px box that would break
                // the badge line's rhythm.
                className="relative rounded-full border border-zinc-700/80 bg-zinc-950/50 p-1.5 text-zinc-400 transition after:absolute after:-inset-2 after:content-[''] hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-40"
              >
                <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
              </button>
            )}
          </div>
        )}
      </div>

      {check && checkedAt && (
        <p className="mt-1.5 text-[11px] text-zinc-600">
          Checked {formatRelativeTime(checkedAt)}
        </p>
      )}

      {headlines.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-zinc-800/60 pt-3">
          {headlines.slice(0, 3).map((h) => (
            <li key={h.link || h.title}>
              <a
                href={h.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs leading-snug text-zinc-400 hover:text-brand-bright"
              >
                {h.title}
                <span className="text-zinc-600"> · {h.publisher}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {loading && !check ? (
        <p className="mt-3 text-sm text-zinc-500">Pulling news & checking thesis …</p>
      ) : check ? (
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-300">
          <p className="text-zinc-100">{check.situation}</p>
          <p>
            <span className="font-medium text-zinc-200">Move:</span>{" "}
            {check.moveReason}
          </p>
          {check.earningsNote ? (
            <p>
              <span className="font-medium text-zinc-200">Earnings:</span>{" "}
              {check.earningsNote}
            </p>
          ) : null}
          {check.action === "trim" && check.trimPct ? (
            <p className="font-medium text-amber-300">
              One option worth weighing: trimming ~{check.trimPct}% of the
              position.
            </p>
          ) : null}
          {check.addLevel ? (
            <p className="font-medium text-brand-bright">{check.addLevel}</p>
          ) : null}
          <p className="text-zinc-100">{check.verdict}</p>
        </div>
      ) : null}

      {convictionThesis ? (
        <p className="mt-3 border-t border-zinc-800/80 pt-2 text-xs text-zinc-500">
          Your thesis: {convictionThesis}
        </p>
      ) : null}
    </li>
  );
}

async function fetchQuote(ticker: string): Promise<Quote | null> {
  try {
    const res = await fetch(
      `/api/quotes?tickers=${encodeURIComponent(ticker)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.quotes?.[ticker] as Quote | undefined) ?? null;
  } catch {
    return null;
  }
}

export function PulsePage({ model, quotes, convictions }: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [pinnedTicker, setPinnedTicker] = useState<string | null>(null);
  const [lookupQuotes, setLookupQuotes] = useState<Record<string, Quote>>({});
  const searchRef = useRef<HTMLDivElement>(null);

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

  const attention = useMemo(
    () =>
      candidates.filter(
        (c) => c.needsAttention && c.ticker.toUpperCase() !== pinnedTicker
      ),
    [candidates, pinnedTicker]
  );
  const rest = useMemo(
    () =>
      candidates.filter(
        (c) =>
          !c.needsAttention && c.ticker.toUpperCase() !== pinnedTicker
      ),
    [candidates, pinnedTicker]
  );

  useEffect(() => {
    for (const c of candidates) hydrateTicker(c.ticker);
  }, [candidates, hydrateTicker]);

  useEffect(() => {
    const cached = loadPulseSummary();
    if (cached) setSummary(cached.summary);
  }, []);

  useEffect(() => {
    let alive = true;
    void fetch("/api/market/fear-greed")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data?.score != null) setFearGreed(data as FearGreedSnapshot);
      })
      .catch(() => {});
    return () => {
      alive = false;
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

  /**
   * Checks a set of tickers in one request. By default only re-checks
   * whichever are missing or stale (>1h, PULSE_REFRESH_MS) — everything
   * else keeps showing its last result untouched. Tickers being refreshed
   * ALSO keep showing their old result (checkingTickers only adds the
   * small "Updating" tag in PulseCard, it never blanks the card) — that's
   * the whole point: analysis happens in the background, the previous
   * result stays viewable the entire time.
   */
  const runPulse = useCallback(
    async (targets: PulseCandidate[], opts?: { force?: boolean }) => {
      if (targets.length === 0) return;
      const force = opts?.force ?? false;
      const notInFlight = targets.filter(
        (c) => !inFlightRef.current.has(c.ticker.toUpperCase())
      );
      const stale = force
        ? notInFlight
        : notInFlight.filter(
            (c) =>
              !isPulseCacheFresh({
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
        });
        const data = await readJsonOrThrow<{
          report: PulseReport;
          headlines?: Record<string, PulseHeadline[]>;
        }>(res, "Pulse check failed");
        const newReport = data.report as PulseReport;
        const newHeadlines =
          (data.headlines as Record<string, PulseHeadline[]>) ?? {};
        const now = new Date().toISOString();

        setChecksByTicker((prev) => {
          const next = { ...prev };
          for (const check of newReport.checks ?? []) {
            next[check.ticker.toUpperCase()] = check;
          }
          return next;
        });
        setHeadlinesByTicker((prev) => ({ ...prev, ...newHeadlines }));
        setCheckedAtByTicker((prev) => {
          const next = { ...prev };
          for (const key of staleKeys) next[key] = now;
          return next;
        });
        for (const check of newReport.checks ?? []) {
          const key = check.ticker.toUpperCase();
          savePulseTickerCache(key, {
            check,
            headlines: newHeadlines[key] ?? [],
            cachedAt: now,
          });
        }
        if (newReport.summary?.trim()) {
          setSummary(newReport.summary);
          savePulseSummary(newReport.summary);
        }
        setLastGeneratedAt(now);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Pulse check failed");
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
  // which would otherwise re-fire this effect (and reset the interval
  // below) constantly even though the underlying tickers never changed.
  const candidateSetKey = candidates
    .map((c) => c.ticker.toUpperCase())
    .sort()
    .join(",");

  // First paint + whenever the candidate SET actually changes: fill in
  // anything missing/stale in the background. Cached results already
  // render from hydrateTicker above, so this never blocks or blanks the
  // page. runPulse's own in-flight guard makes it safe to call again with
  // an overlapping ticker list.
  useEffect(() => {
    if (candidates.length === 0) return;
    void runPulse(candidates);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed off the stable ticker-set signature, not candidates/runPulse identity churn
  }, [candidateSetKey]);

  // Hourly background sweep, no market-session gating at all — this runs
  // the same in pre-market, after-hours, and while the market's closed, not
  // just during regular hours.
  useEffect(() => {
    if (candidates.length === 0) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void runPulse(candidates);
    }, PULSE_REFRESH_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed off the stable ticker-set signature so the hourly timer survives quote-refresh churn
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
      const q = await fetchQuote(ticker);
      if (q) {
        setLookupQuotes((prev) => ({ ...prev, [ticker]: q }));
        quoteMap = { ...quoteMap, [ticker]: q };
      } else {
        setError(`Could not fetch a quote for ${cashtag(ticker)}. Check the symbol.`);
        return;
      }
    }

    const candidate = buildPulseCandidate(ticker, model, quoteMap);
    await runPulse([candidate], { force: true });
  }

  async function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    await checkTicker(searchInput);
  }

  const anyChecking = checkingTickers.size > 0;
  const pinnedLoading = Boolean(
    pinnedTicker && checkingTickers.has(pinnedTicker)
  );

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-bright">
              Thesis Pulse
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Should you sell, or add the dip?
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Type any ticker and hit Check, even if it&apos;s already in your
              book. Big book loads from cache instantly, refreshes hourly in the
              background, and your check pins to the top with a ticker-only
              update when needed.
            </p>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-zinc-600">
              {ADVICE_DISCLAIMER_LONG}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runPulse(candidates, { force: true })}
            disabled={anyChecking || candidates.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", anyChecking && "animate-spin")} />
            Refresh all
          </button>
        </div>

        <form onSubmit={(e) => void submitSearch(e)} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div ref={searchRef} className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && suggestions[0]) {
                  e.preventDefault();
                  void checkTicker(suggestions[0]!);
                }
              }}
              placeholder="Type ticker: BMNR, RKLB, NVDA …"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 py-2 pl-8 pr-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-brand/50"
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
                      <span className="ml-2 text-xs text-zinc-500">in book</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="submit"
            disabled={!searchInput.trim() || pinnedLoading}
            className="shrink-0 rounded-lg bg-brand px-3 py-2.5 text-xs font-semibold text-[#121214] hover:bg-brand-bright disabled:opacity-40 sm:py-2"
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
              className="inline-flex items-center gap-0.5 text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          </div>
        )}

        {fearGreed && (
          <p className="mt-3 text-xs text-zinc-500">
            Market mood: Fear &amp; Greed{" "}
            <span
              className={cn(
                "font-semibold tabular-nums",
                fearGreedTone(fearGreed.score) === "fear" && "text-sky-300",
                fearGreedTone(fearGreed.score) === "neutral" && "text-zinc-300",
                fearGreedTone(fearGreed.score) === "greed" && "text-amber-300"
              )}
            >
              {fearGreed.score}
            </span>{" "}
            · {fearGreed.rating}
          </p>
        )}

        {summary && !pinnedTicker && (
          <p className="mt-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200">
            {summary}
          </p>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </section>

      {pinnedCandidate && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-bright">
            Your check
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
              pinned
            />
          </ul>
        </section>
      )}

      {candidates.length === 0 && !pinnedCandidate ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/30 px-4 py-8 text-center">
          <p className="text-sm text-zinc-300">No positions in the book yet.</p>
          <p className="mt-1 text-xs text-zinc-500">
            Type a ticker above to run a one-off check.
          </p>
        </section>
      ) : (
        <div className="space-y-6">
          {attention.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-300">
                Needs attention · down {formatMovePct(-PULSE_DOWN_THRESHOLD)}+
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
                  />
                ))}
              </ul>
            </section>
          )}

          {rest.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {attention.length > 0
                  ? "Rest of big book"
                  : `Big book · top ${plural(rest.length, "position")}`}
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
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {lastGeneratedAt && (
        <p className="text-center text-[11px] text-zinc-600">
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
