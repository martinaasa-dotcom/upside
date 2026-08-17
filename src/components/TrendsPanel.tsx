"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CARD, InfoTip, NESTED_PAD, Panel, PanelHeader, SPLIT_COPY, SPLIT_ROW } from "@/components/ui/Panel";
import { cashtag, cn } from "@/lib/format";
import { readJsonOrThrow } from "@/lib/http";
import { buildTrendStory, type Signal, type Tone, type TrendRowLike } from "@/lib/market/trend-story";
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
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { isAbortError } from "@/lib/abort";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { loadTrendsPaint, saveTrendsPaint } from "@/lib/paint-cache";

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
  warn: "text-caution",
  neutral: "text-foreground/80",
};

const TONE_BADGE: Record<Tone, string> = {
  gain: "bg-gain/15 text-gain border-gain/30",
  loss: "bg-loss/15 text-loss border-loss/30",
  warn: "bg-caution/15 text-caution border-caution/40",
  neutral: "bg-accent text-foreground/80 border-border",
};

function ToneIcon({ tone, className }: { tone: Tone; className?: string }) {
  if (tone === "gain") return <TrendingUp className={className} />;
  if (tone === "loss") return <TrendingDown className={className} />;
  if (tone === "warn") return <AlertTriangle className={className} />;
  return <Minus className={className} />;
}

function SignalTile({
  signal,
  wide = false,
}: {
  signal: Signal;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        CARD,
        NESTED_PAD,
        "text-center",
        wide && "sm:col-span-2"
      )}
    >
      <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground">
        <span>{signal.label}</span>
        <InfoTip text={signal.help} />
      </p>
      <p
        className={cn(
          "mt-1.5 inline-flex items-center justify-center gap-1.5 font-heading text-lg font-semibold tracking-tight",
          TONE_TEXT[signal.tone]
        )}
      >
        <ToneIcon tone={signal.tone} className="h-4 w-4" />
        {signal.value}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm tabular-nums text-muted-foreground">
        {signal.detail.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
    </div>
  );
}

/** One holding's whole trend story: verdict on top, then the slow 40-week
 * read full-width and the four faster signals in a 2×2. */
function TickerStoryCard({
  row,
  isHolding,
}: {
  row: TrendRow;
  isHolding: boolean;
}) {
  const story = useMemo(() => buildTrendStory(row), [row]);

  return (
    <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <div className={cn(SPLIT_ROW, "sm:items-center")}>
        <div className={cn(SPLIT_COPY, "flex items-center gap-2")}>
          <span className="text-base font-semibold text-foreground">
            {cashtag(row.ticker)}
          </span>
          {!isHolding && (
            <Badge variant="outline">watching</Badge>
          )}
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium",
            TONE_BADGE[story.tone]
          )}
        >
          <ToneIcon tone={story.tone} className="h-3.5 w-3.5" />
          {story.headline}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-foreground/80">
        {story.sentence}
      </p>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {story.signals.map((s) => (
          <SignalTile key={s.key} signal={s} wide={s.key === "trend"} />
        ))}
      </div>

      {row.divergence && (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
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
  const [watchlist, setWatchlist] = useHydratedCache<string[]>(
    loadTrendsWatchlist,
    []
  );
  const holdingSet = useMemo(
    () => new Set(tickers.map((t) => t.toUpperCase())),
    [tickers]
  );
  const combined = useMemo(
    () => [...tickers, ...watchlist.filter((t) => !holdingSet.has(t))],
    [tickers, watchlist, holdingSet]
  );
  const key = combined.join(",");

  const [rows, setRows] = useHydratedCache<TrendRow[] | null>(
    () => (key ? loadTrendsPaint(key) : []),
    null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!key) {
      setRows([]);
      return;
    }
    const cached = loadTrendsPaint(key);
    if (cached) setRows(cached);
  }, [key, setRows]);

  const load = useCallback(async (force = false, signal?: AbortSignal) => {
    if (!key) {
      setRows([]);
      return;
    }
    const cached = loadTrendsPaint(key);
    if (cached && !force) setRows(cached);
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
      const next = data.rows ?? [];
      setRows(next);
      saveTrendsPaint(key, next);
    } catch (e) {
      if (isAbortError(e)) return;
      if (loadTrendsPaint(key) != null) return;
      setError(e instanceof Error ? e.message : "Couldn't load trends. Try again.");
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, [key, setRows]);

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
  }, [key, load, setRows]);

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
  }, [draft, holdingSet, watchlist, combined.length, setWatchlist]);

  const removeFromWatchlist = useCallback((symbol: string) => {
    setWatchlist((prev) => removeWatchlistTicker(prev, symbol));
  }, [setWatchlist]);

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
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader
          title="Is the trend changing?"
          actions={
            <Button
              type="button"
              variant="outline"
              onClick={() => void load(true)}
              disabled={busy}
            >
              <RefreshCw
                data-icon="inline-start"
                className={cn(busy && "animate-spin")}
              />
              {busy ? "Reading …" : "Recheck"}
            </Button>
          }
        />
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
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

        <div className="mt-4 border-t border-border pt-4">
          <h3 className="text-sm font-medium tracking-tight text-foreground">
            Watch anything, not just what you hold
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Add a sector ETF, an index, or a crypto pair to read its trend the
            same way, e.g. $XLK for tech, $SPY for the index, or BTC-USD.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setAddError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") addToWatchlist();
              }}
              placeholder="BTC-USD, XLK, SPY …"
              className="w-40"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addToWatchlist}
              disabled={!draft.trim()}
            >
              <Plus data-icon="inline-start" />
              Add
            </Button>
            {watchlist.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-1.5 text-sm text-foreground"
              >
                {cashtag(t)}
                <button
                  type="button"
                  onClick={() => removeFromWatchlist(t)}
                  aria-label={`Remove ${t} from watchlist`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          {addError && (
            <p className="mt-2 text-sm text-loss">{addError}</p>
          )}
        </div>
      </Panel>

      {error && (
        <div className="rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
          {error}
        </div>
      )}

      {rows == null && !error && (
        <div className="rounded-xl bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          Reading four years of weekly bars …
        </div>
      )}

      {rows != null && rows.length === 0 && !error && (
        <div className="rounded-xl bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          Add a holding, or watch a ticker above, and its trend read shows up
          here.
        </div>
      )}

      {rows != null && rows.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">
            {attentionCount === 0
              ? "Nothing below is diverging or rolling over right now. Sorted by who's beating the S&P."
              : `${attentionCount} name${attentionCount === 1 ? "" : "s"} below ${attentionCount === 1 ? "has" : "have"} something actually changing, those come first.`}
          </p>

          <div className="flex flex-col gap-3">
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
              <p className="mt-3 mb-4 text-sm leading-relaxed text-muted-foreground">
                The same names, ranked by how they did against the S&amp;P over
                the last quarter. This is money moving from one group to
                another, not just prices going up with everything else.
              </p>
              <div className="flex flex-col gap-1.5">
                {leaders.map((r) => {
                  const v = r.rs13 ?? 0;
                  const width = Math.min(100, Math.abs(v) * 100 * 1.6);
                  return (
                    <div key={r.ticker} className="flex items-center gap-3">
                      <span className="w-16 shrink-0 truncate text-sm font-medium text-foreground">
                        {cashtag(r.ticker)}
                      </span>
                      <div className="relative h-2 min-w-0 flex-1 rounded-full bg-muted">
                        <div
                          className={cn(
                            "absolute top-0 h-full rounded-full",
                            v >= 0 ? "bg-gain/70 left-1/2" : "bg-loss/70 right-1/2"
                          )}
                          style={{ width: `${width / 2}%` }}
                        />
                        <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                      </div>
                      <span
                        className={cn(
                          "w-16 shrink-0 text-right text-sm tabular-nums",
                          v >= 0 ? "text-gain" : "text-loss"
                        )}
                      >
                        {rsText(r.rs13)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-right text-sm text-muted-foreground">
                vs S&amp;P, last 13 weeks
              </p>
            </Panel>
          )}

          <p className="text-sm text-muted-foreground">
            Technical readings on past prices, not a forecast and not advice.
            Divergences can persist for months before anything happens, or
            resolve with no break at all.
          </p>
        </>
      )}
    </div>
  );
}
