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
  buildPulseCandidates,
  formatMovePct,
  pulseCacheKey,
  loadPulseCache,
  savePulseCache,
  statusLabel,
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
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

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

function statusBorder(status: ThesisStatus, urgent: boolean) {
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
}: {
  candidate: PulseCandidate;
  check?: PulseCheck;
  headlines: PulseHeadline[];
  loading: boolean;
  convictionThesis?: string;
}) {
  const pct = c.effectivePct ?? 0;
  const up = pct >= 0;
  const status = check?.thesisStatus ?? (c.needsAttention ? "watch" : "intact");

  return (
    <li
      className={cn(
        "rounded-xl border px-4 py-4",
        check
          ? statusBorder(status, c.needsAttention)
          : c.needsAttention
            ? "border-rose-500/30 bg-rose-950/15"
            : "border-zinc-800 bg-[#161618]/60"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-white">{c.ticker}</span>
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-950/50 px-2.5 py-1 text-[11px] font-medium text-zinc-200">
            <StatusIcon status={status} />
            {statusLabel(status)}
          </span>
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
          <p className="font-medium text-white">{check.verdict}</p>
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

export function PulsePage({ model, quotes, convictions }: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [extraTickers, setExtraTickers] = useState<string[]>([]);
  const [lookupQuotes, setLookupQuotes] = useState<Record<string, Quote>>({});

  const mergedQuotes = useMemo(
    () => ({ ...quotes, ...lookupQuotes }),
    [quotes, lookupQuotes]
  );

  const candidates = useMemo(
    () =>
      buildPulseCandidates(model, mergedQuotes, {
        extraTickers,
      }),
    [model, mergedQuotes, extraTickers]
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

  const attention = useMemo(
    () => candidates.filter((c) => c.needsAttention),
    [candidates]
  );
  const rest = useMemo(
    () => candidates.filter((c) => !c.needsAttention),
    [candidates]
  );

  useEffect(() => {
    const cached = loadPulseCache(cacheKey);
    if (cached) setReport(cached);
    else setReport(null);
  }, [cacheKey]);

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

  const runPulse = useCallback(
    async (force = false) => {
      if (candidates.length === 0) return;
      if (!force) {
        const cached = loadPulseCache(cacheKey);
        if (cached) {
          setReport(cached);
          return;
        }
      }
      setLoading(true);
      setError(null);
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
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Pulse check failed");
        }
        const next = data.report as PulseReport;
        setReport(next);
        setHeadlinesByTicker(
          (data.headlines as Record<string, PulseHeadline[]>) ?? {}
        );
        savePulseCache(cacheKey, next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Pulse check failed");
      } finally {
        setLoading(false);
      }
    },
    [cacheKey, candidates, convictions, fearGreed]
  );

  useEffect(() => {
    if (candidates.length === 0) return;
    void runPulse(false);
  }, [candidates, runPulse]);

  async function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const ticker = searchInput.trim().toUpperCase();
    if (!ticker) return;
    setSearchInput("");

    if (!mergedQuotes[ticker]) {
      try {
        const res = await fetch(
          `/api/quotes?tickers=${encodeURIComponent(ticker)}`
        );
        const data = await res.json();
        const q = data.quotes?.[ticker] as Quote | undefined;
        if (q) {
          setLookupQuotes((prev) => ({ ...prev, [ticker]: q }));
        }
      } catch {
        /* still add ticker — API will fetch news */
      }
    }

    setExtraTickers((prev) =>
      prev.includes(ticker) ? prev : [...prev, ticker]
    );
  }

  const checksByTicker = useMemo(() => {
    const map = new Map<string, PulseCheck>();
    for (const check of report?.checks ?? []) {
      map.set(check.ticker.toUpperCase(), check);
    }
    return map;
  }, [report]);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-bright">
              Thesis Pulse
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Should you sell — or is the thesis intact?
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Built for red days: flags big lines down{" "}
              {formatMovePct(-PULSE_DOWN_THRESHOLD)} or more (incl. pre-market /
              after-hours), pulls live news, and gives a plain read. By default
              your top book positions are here in one view.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runPulse(true)}
            disabled={loading || candidates.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>

        <form onSubmit={(e) => void submitSearch(e)} className="mt-4 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
              placeholder="Check any ticker — e.g. RKLB"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 py-2 pl-8 pr-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-brand/50"
            />
          </div>
          <button
            type="submit"
            disabled={!searchInput.trim()}
            className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-[#121214] hover:bg-brand-bright disabled:opacity-40"
          >
            Check
          </button>
        </form>

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

        {report?.summary && (
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

      {candidates.length === 0 ? (
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
                    loading={loading}
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
                    loading={loading}
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
          {" · "}
          cached for today
        </p>
      )}
    </div>
  );
}
