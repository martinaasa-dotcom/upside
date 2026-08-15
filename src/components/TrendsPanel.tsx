"use client";

import { Panel, PanelHeader, Stat } from "@/components/ui/Panel";
import { cashtag, cn } from "@/lib/format";
import { readJsonOrThrow } from "@/lib/http";
import { buildTrendStory, type Tone, type TrendRowLike } from "@/lib/market/trend-story";
import {
  addWatchlistTicker,
  loadWatchlist,
  removeWatchlistTicker,
  saveWatchlist,
} from "@/lib/watchlist";
import {
  AlertTriangle,
  Minus,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isAbortError } from "@/lib/abort";

// Mirrors MAX_TICKERS in src/lib/market/trends-cache.ts; kept as a plain
// constant here so this client component never imports the yahoo-finance2
// dependency chain.
const MAX_TICKERS = 14;
const LEGACY_WATCHLIST_KEY = "portfell-trends-watchlist";

function loadTrendsWatchlist(): string[] {
  const shared = loadWatchlist();
  if (shared.length > 0 || typeof window === "undefined") return shared;
  try {
    const raw = window.localStorage.getItem(LEGACY_WATCHLIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const legacy = Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === "string")
      : [];
    if (legacy.length > 0) {
      saveWatchlist(legacy);
      window.localStorage.removeItem(LEGACY_WATCHLIST_KEY);
      return loadWatchlist();
    }
  } catch {
    /* ignore */
  }
  return shared;
}

type TrendRow = TrendRowLike;

const TONE_TEXT: Record<Tone, string> = {
  gain: "text-gain",
  loss: "text-loss",
  warn: "text-amber-300",
  neutral: "text-zinc-300",
};

const TONE_BADGE: Record<Tone, string> = {
  gain: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
  loss: "bg-rose-500/15 text-rose-200 border-rose-500/30",
  warn: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  neutral: "bg-zinc-800 text-zinc-300 border-zinc-700",
};

function ToneIcon({ tone, className }: { tone: Tone; className?: string }) {
  if (tone === "gain") return <TrendingUp className={className} />;
  if (tone === "loss") return <TrendingDown className={className} />;
  if (tone === "warn") return <AlertTriangle className={className} />;
  return <Minus className={className} />;
}

/** One holding's whole trend story, laid out so a novice can read it top
 * to bottom without cross-referencing a table: what's true, why, and how
 * strongly the underlying signals agree. */
function TickerStoryCard({
  row,
  isHolding,
}: {
  row: TrendRow;
  isHolding: boolean;
}) {
  const story = useMemo(() => buildTrendStory(row), [row]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-card/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-white">
            {cashtag(row.ticker)}
          </span>
          {!isHolding && (
            <span className="rounded-full border border-zinc-700 px-1.5 py-0.5 text-xs text-zinc-400">
              watching
            </span>
          )}
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
            TONE_BADGE[story.tone]
          )}
        >
          <ToneIcon tone={story.tone} className="h-3.5 w-3.5" />
          {story.headline}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-zinc-300">
        {story.sentence}
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {story.signals.map((s) => (
          <Stat
            key={s.key}
            label={s.label}
            value={s.value}
            sub={s.detail}
            explain={s.help}
            valueClassName={TONE_TEXT[s.tone]}
            subClassName="text-xs leading-relaxed text-zinc-400"
          />
        ))}
      </div>

      {row.divergence && (
        <p className="mt-3 text-xs leading-relaxed text-zinc-400">
          Price made a {row.divergence.kind === "bearish" ? "higher high" : "lower low"} (
          {row.divergence.priceFrom.toFixed(0)} → {row.divergence.priceTo.toFixed(0)}) while RSI went the
          other way ({row.divergence.rsiFrom.toFixed(0)} → {row.divergence.rsiTo.toFixed(0)}). Confirmed{" "}
          {row.divergence.weeksAgo === 0 ? "this week" : `${row.divergence.weeksAgo}w ago`}.
        </p>
      )}
    </div>
  );
}

function rsText(v: number | null): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

export function TrendsPanel({ tickers }: { tickers: string[] }) {
  const [rows, setRows] = useState<TrendRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    setWatchlist(loadTrendsWatchlist());
  }, []);

  const holdingSet = useMemo(
    () => new Set(tickers.map((t) => t.toUpperCase())),
    [tickers]
  );
  const combined = useMemo(
    () => [...tickers, ...watchlist.filter((t) => !holdingSet.has(t))],
    [tickers, watchlist, holdingSet]
  );
  const key = combined.join(",");

  const load = useCallback(async (force = false, signal?: AbortSignal) => {
    if (!key) {
      setRows([]);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: key.split(","), force }),
        signal,
      });
      const data = await readJsonOrThrow<{ rows: TrendRow[] }>(
        res,
        "Couldn't load trends. Try again."
      );
      setRows(data.rows ?? []);
    } catch (e) {
      if (isAbortError(e)) return;
      setError(e instanceof Error ? e.message : "Couldn't load trends. Try again.");
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, [key]);

  // Weekly indicators barely move intraday, so fetch once per ticker set
  // rather than polling. The button is there for a manual recheck.
  useEffect(() => {
    if (!key) {
      setRows([]);
      setBusy(false);
      return;
    }
    const ctrl = new AbortController();
    void load(false, ctrl.signal);
    return () => ctrl.abort();
  }, [key, load]);

  const addToWatchlist = useCallback(() => {
    const symbol = draft.trim().toUpperCase().replace(/\s+/g, "");
    if (!symbol) return;
    if (holdingSet.has(symbol) || watchlist.includes(symbol)) {
      setAddError(`${symbol} is already on the list.`);
      return;
    }
    if (combined.length >= MAX_TICKERS) {
      setAddError(`That's the limit, ${MAX_TICKERS} names at once.`);
      return;
    }
    const next = addWatchlistTicker(watchlist, symbol);
    setWatchlist(next);
    setDraft("");
    setAddError(null);
  }, [draft, holdingSet, watchlist, combined.length]);

  const removeFromWatchlist = useCallback((symbol: string) => {
    setWatchlist((prev) => removeWatchlistTicker(prev, symbol));
  }, []);

  // Stories with the loudest news (a divergence, a regime actually
  // changing) float to the top; everything else falls back to who's
  // leading or lagging the index, so the order itself is part of the read.
  const stories = useMemo(() => {
    if (!rows) return [];
    return rows
      .map((r) => ({ row: r, story: buildTrendStory(r) }))
      .sort((a, b) => b.story.priority - a.story.priority);
  }, [rows]);

  const attentionCount = stories.filter((s) => s.story.attention).length;

  const leaders = [...(rows ?? [])]
    .filter((r) => r.rs13 != null)
    .sort((a, b) => (b.rs13 ?? 0) - (a.rs13 ?? 0));

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Is the trend changing?"
          actions={
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={busy}
              className="btn-secondary"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
              {busy ? "Reading …" : "Recheck"}
            </button>
          }
        />
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Showing up to {MAX_TICKERS} names at once
          {combined.length > MAX_TICKERS
            ? ` (${MAX_TICKERS} of ${combined.length} queued).`
            : combined.length > 0
              ? ` (${Math.min(combined.length, MAX_TICKERS)} on the list).`
              : "."}{" "}
          Weekly bars, so this answers whether the story changed, not what
          happened today. Each box shows the verdict and the numbers it
          used.
        </p>

        <div className="mt-5 border-t border-zinc-800 pt-5">
          <h3 className="text-base font-bold text-white">
            Watch anything, not just what you hold
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
            Add a sector ETF, an index, or a crypto pair to read its trend the
            same way, e.g. $XLK for tech, $SPY for the index, or BTC-USD.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setAddError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") addToWatchlist();
              }}
              placeholder="BTC-USD, XLK, SPY …"
              className="h-9 w-40 rounded-lg border border-zinc-700 bg-black/20 px-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={addToWatchlist}
              disabled={!draft.trim()}
              className="btn-secondary disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
            {watchlist.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-200"
              >
                {cashtag(t)}
                <button
                  type="button"
                  onClick={() => removeFromWatchlist(t)}
                  aria-label={`Remove ${t} from watchlist`}
                  className="text-zinc-500 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          {addError && (
            <p className="mt-1.5 text-xs text-loss">{addError}</p>
          )}
        </div>
      </Panel>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {rows == null && !error && (
        <div className="rounded-xl border border-zinc-800 bg-card/80 px-4 py-10 text-center text-sm text-zinc-400">
          Reading four years of weekly bars …
        </div>
      )}

      {rows != null && rows.length === 0 && !error && (
        <div className="rounded-xl border border-zinc-800 bg-card/80 px-4 py-10 text-center text-sm text-zinc-400">
          Add a holding, or watch a ticker above, and its trend read shows up
          here.
        </div>
      )}

      {rows != null && rows.length > 0 && (
        <>
          <p className="text-sm text-zinc-400">
            {attentionCount === 0
              ? "Nothing below is diverging or rolling over right now. Sorted by who's beating the S&P."
              : `${attentionCount} name${attentionCount === 1 ? "" : "s"} below ${attentionCount === 1 ? "has" : "have"} something actually changing, those come first.`}
          </p>

          <div className="space-y-3">
            {stories.map(({ row }) => (
              <TickerStoryCard
                key={row.ticker}
                row={row}
                isHolding={holdingSet.has(row.ticker)}
              />
            ))}
          </div>

          {leaders.length > 1 && (
            <Panel>
              <PanelHeader title="Who's leading, who's fading" />
              <p className="mt-3 mb-4 text-sm leading-relaxed text-zinc-400">
                The same names, ranked by how they did against the S&amp;P over
                the last quarter. This is money moving from one group to
                another, not just prices going up with everything else.
              </p>
              <div className="space-y-1.5">
                {leaders.map((r) => {
                  const v = r.rs13 ?? 0;
                  const width = Math.min(100, Math.abs(v) * 100 * 1.6);
                  return (
                    <div key={r.ticker} className="flex items-center gap-3">
                      <span className="w-16 shrink-0 truncate text-xs font-medium text-zinc-200">
                        {cashtag(r.ticker)}
                      </span>
                      <div className="relative h-2 min-w-0 flex-1 rounded-full bg-zinc-900">
                        <div
                          className={cn(
                            "absolute top-0 h-full rounded-full",
                            v >= 0 ? "bg-gain/70 left-1/2" : "bg-loss/70 right-1/2"
                          )}
                          style={{ width: `${width / 2}%` }}
                        />
                        <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-700" />
                      </div>
                      <span
                        className={cn(
                          "w-16 shrink-0 text-right text-xs tabular-nums",
                          v >= 0 ? "text-gain" : "text-loss"
                        )}
                      >
                        {rsText(r.rs13)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-right text-xs text-zinc-400">
                vs S&amp;P, last 13 weeks
              </p>
            </Panel>
          )}

          <p className="text-sm text-zinc-400">
            Technical readings on past prices, not a forecast and not advice.
            Divergences can persist for months before anything happens, or
            resolve with no break at all.
          </p>
        </>
      )}
    </div>
  );
}
