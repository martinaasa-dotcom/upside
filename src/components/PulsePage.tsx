"use client";

import {
  currency,
  percent,
  signedCurrency,
  cn,
} from "@/lib/format";
import type { ConvictionMap } from "@/lib/conviction";
import type { FearGreedSnapshot } from "@/lib/market/fear-greed";
import { fearGreedTone } from "@/lib/market/fear-greed";
import type { OverviewModel } from "@/lib/overview";
import type { Quote } from "@/lib/types";
import {
  PULSE_DOWN_THRESHOLD,
  PULSE_REFRESH_MS,
  buildPulseCandidate,
  buildPulseCandidates,
  formatMovePct,
  isPulseCacheFresh,
  loadPulseCache,
  pulseCacheKey,
  pulseSingleCacheKey,
  savePulseCache,
  statusLabel,
  actionLabel,
  type PulseCacheEntry,
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
  pinned = false,
}: {
  candidate: PulseCandidate;
  check?: PulseCheck;
  headlines: PulseHeadline[];
  loading: boolean;
  convictionThesis?: string;
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
            <span className="text-base font-semibold text-white">{c.ticker}</span>
            {pinned && (
              <span className="rounded bg-brand/20 px-1.5 py-0.5 text-[10px] font-medium text-brand-bright">
                Your check
              </span>
            )}
            {!c.inBook && (
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                Lookup
              </span>
            )}
            {c.needsAttention && (
              <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-medium text-rose-200">
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
          </div>
          {c.inBook ? (
            <p className="mt-0.5 text-xs text-zinc-500">
              {percent(c.bookPct)} of book · {signedCurrency(c.todayDollar)} ·{" "}
              {currency(c.currentValue)} · lifetime {percent(c.roiPct)} ·{" "}
              {c.portfolios.join(", ")}
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
          </div>
        )}
      </div>

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
        <p className="mt-3 text-sm text-zinc-500">Pulling news & checking thesis…</p>
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
              Take profit: trim ~{check.trimPct}% of position.
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
  const [checkingTicker, setCheckingTicker] = useState<string | null>(null);
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

  const cacheKey = useMemo(
    () => pulseCacheKey(candidates.map((c) => c.ticker)),
    [candidates]
  );

  const [report, setReport] = useState<PulseReport | null>(null);
  const [headlinesByTicker, setHeadlinesByTicker] = useState<
    Record<string, PulseHeadline[]>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fearGreed, setFearGreed] = useState<FearGreedSnapshot | null>(null);

  const applyCacheEntry = useCallback((entry: PulseCacheEntry) => {
    setReport(entry.report);
    setHeadlinesByTicker(entry.headlines ?? {});
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
    const cached = loadPulseCache(cacheKey);
    if (cached) applyCacheEntry(cached);
    else {
      setReport(null);
      setHeadlinesByTicker({});
    }
  }, [applyCacheEntry, cacheKey]);

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
  }, [pinnedTicker, checkingTicker]);

  const runPulse = useCallback(
    async (opts?: { force?: boolean; background?: boolean }) => {
      if (candidates.length === 0) return;
      const force = opts?.force ?? false;
      const background = opts?.background ?? false;
      const cached = loadPulseCache(cacheKey);
      if (cached) {
        applyCacheEntry(cached);
        if (!force && isPulseCacheFresh(cached)) {
          return;
        }
      }
      if (!background || !cached) {
        setLoading(true);
      }
      if (!background) setError(null);
      try {
        const convictionPayload: Record<
          string,
          { thesis?: string; level?: number }
        > = {};
        for (const c of candidates) {
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
            candidates,
            convictions: convictionPayload,
            fearGreed,
            force,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Pulse check failed");
        }
        const entry: PulseCacheEntry = {
          report: data.report as PulseReport,
          headlines:
            (data.headlines as Record<string, PulseHeadline[]>) ?? {},
          cachedAt: new Date().toISOString(),
        };
        applyCacheEntry(entry);
        savePulseCache(cacheKey, entry);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Pulse check failed");
      } finally {
        if (!background || !cached) {
          setLoading(false);
        }
      }
    },
    [applyCacheEntry, cacheKey, candidates, convictions, fearGreed]
  );

  const runSingleCheck = useCallback(
    async (ticker: string, quoteMap: Record<string, Quote>) => {
      const key = ticker.toUpperCase();
      const candidate = buildPulseCandidate(key, model, quoteMap);
      const singleCacheKey = pulseSingleCacheKey(key);
      const cached = loadPulseCache(singleCacheKey);
      setCheckingTicker(key);
      setError(null);
      if (cached) {
        setReport((prev) => {
          const checks = [...(prev?.checks ?? [])].filter(
            (c) => c.ticker.toUpperCase() !== key
          );
          checks.push(...(cached.report.checks ?? []));
          return {
            summary: cached.report.summary || prev?.summary || "",
            checks,
            generatedAt: cached.report.generatedAt,
          };
        });
        setHeadlinesByTicker((prev) => ({ ...prev, ...cached.headlines }));
        if (isPulseCacheFresh(cached)) {
          setCheckingTicker(null);
          return;
        }
      } else {
        setLoading(true);
      }
      try {
        const entry = convictions[key];
        const res = await fetch("/api/thesis/pulse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidates: [candidate],
            convictions: entry
              ? { [key]: { thesis: entry.thesis, level: entry.level } }
              : {},
            fearGreed,
            force: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Pulse check failed");
        }
        const single = data.report as PulseReport;
        const newHeadlines =
          (data.headlines as Record<string, PulseHeadline[]>) ?? {};
        const nextCacheEntry: PulseCacheEntry = {
          report: single,
          headlines: newHeadlines,
          cachedAt: new Date().toISOString(),
        };

        setReport((prev) => {
          const checks = [...(prev?.checks ?? [])].filter(
            (c) => c.ticker.toUpperCase() !== key
          );
          checks.push(...(single.checks ?? []));
          return {
            summary: single.summary || prev?.summary || "",
            checks,
            generatedAt: new Date().toISOString(),
          };
        });
        setHeadlinesByTicker((prev) => ({ ...prev, ...newHeadlines }));
        savePulseCache(singleCacheKey, nextCacheEntry);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Pulse check failed");
      } finally {
        setLoading(false);
        setCheckingTicker(null);
      }
    },
    [convictions, fearGreed, model]
  );

  useEffect(() => {
    if (candidates.length === 0) return;
    void runPulse({ background: true });
  }, [candidates, runPulse]);

  useEffect(() => {
    if (candidates.length === 0) return;
    const id = window.setInterval(() => {
      void runPulse({ force: true, background: true });
    }, PULSE_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [candidates.length, runPulse]);

  async function checkTicker(tickerRaw: string) {
    const ticker = tickerRaw.trim().toUpperCase();
    if (!ticker) return;
    setSearchInput("");
    setPinnedTicker(ticker);
    setError(null);

    let quoteMap = mergedQuotes;
    if (!quoteMap[ticker]) {
      const q = await fetchQuote(ticker);
      if (q) {
        setLookupQuotes((prev) => ({ ...prev, [ticker]: q }));
        quoteMap = { ...quoteMap, [ticker]: q };
      } else {
        setError(`Could not fetch a quote for ${ticker} — check the symbol.`);
        return;
      }
    }

    await runSingleCheck(ticker, quoteMap);
  }

  async function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    await checkTicker(searchInput);
  }

  const checksByTicker = useMemo(() => {
    const map = new Map<string, PulseCheck>();
    for (const check of report?.checks ?? []) {
      map.set(check.ticker.toUpperCase(), check);
    }
    return map;
  }, [report]);

  const pinnedLoading = checkingTicker === pinnedTicker || (loading && !checksByTicker.get(pinnedTicker ?? ""));

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-bright">
              Thesis Pulse
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Should you sell — or add the dip?
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Type any ticker and hit Check — even if it&apos;s already in your
              book. Big book loads from cache instantly, refreshes hourly in the
              background, and your check pins to the top with a ticker-only
              update when needed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runPulse({ force: true })}
            disabled={loading || candidates.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh all
          </button>
        </div>

        <form onSubmit={(e) => void submitSearch(e)} className="mt-4 flex gap-2">
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
              placeholder="Type ticker — BMNR, RKLB, NVDA…"
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
            disabled={!searchInput.trim() || loading}
            className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-[#121214] hover:bg-brand-bright disabled:opacity-40"
          >
            {checkingTicker ? "Checking…" : "Check"}
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

        {report?.summary && !pinnedTicker && (
          <p className="mt-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200">
            {report.summary}
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
              check={checksByTicker.get(pinnedCandidate.ticker.toUpperCase())}
              headlines={
                headlinesByTicker[pinnedCandidate.ticker.toUpperCase()] ?? []
              }
              loading={pinnedLoading}
              convictionThesis={
                convictions[pinnedCandidate.ticker.toUpperCase()]?.thesis
              }
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
                    check={checksByTicker.get(c.ticker.toUpperCase())}
                    headlines={headlinesByTicker[c.ticker.toUpperCase()] ?? []}
                    loading={loading && checkingTicker !== c.ticker}
                    convictionThesis={
                      convictions[c.ticker.toUpperCase()]?.thesis
                    }
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
                  : `Big book · top ${rest.length} positions`}
              </h3>
              <ul className="space-y-3">
                {rest.map((c) => (
                  <PulseCard
                    key={c.ticker}
                    candidate={c}
                    check={checksByTicker.get(c.ticker.toUpperCase())}
                    headlines={headlinesByTicker[c.ticker.toUpperCase()] ?? []}
                    loading={loading && checkingTicker !== c.ticker}
                    convictionThesis={
                      convictions[c.ticker.toUpperCase()]?.thesis
                    }
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {report?.generatedAt && (
        <p className="text-center text-[11px] text-zinc-600">
          Last checked{" "}
          {new Date(report.generatedAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      )}
    </div>
  );
}
