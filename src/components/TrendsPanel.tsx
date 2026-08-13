"use client";

import { cashtag, cn } from "@/lib/format";
import { readJsonOrThrow } from "@/lib/http";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const WATCHLIST_KEY = "portfell-trends-watchlist";
// Mirrors MAX_TICKERS in src/lib/market/trends-cache.ts; kept as a plain
// constant here so this client component never imports the yahoo-finance2
// dependency chain.
const MAX_TICKERS = 14;

function loadWatchlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === "string")
      : [];
  } catch {
    return [];
  }
}

type TrendRow = {
  ticker: string;
  regime: "strong-up" | "weakening" | "strong-down" | "recovering" | "flat";
  aboveLongMa: boolean | null;
  rsi: number | null;
  macdHistogram: number | null;
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
  lastClose: number | null;
};

const REGIME_COPY: Record<TrendRow["regime"], { label: string; tone: string; blurb: string }> = {
  "strong-up": {
    label: "Uptrend",
    tone: "text-gain",
    blurb: "Above its long average, and that average is still climbing.",
  },
  weakening: {
    label: "Weakening",
    tone: "text-amber-300",
    blurb: "Still above its long average, but the average has rolled over.",
  },
  "strong-down": {
    label: "Downtrend",
    tone: "text-loss",
    blurb: "Below its long average, and that average is falling.",
  },
  recovering: {
    label: "Turning up",
    tone: "text-sky-300",
    blurb: "Below its long average, but the average has started rising.",
  },
  flat: {
    label: "No trend",
    tone: "text-zinc-400",
    blurb: "Not enough direction to call, or not enough history yet.",
  },
};

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
    setWatchlist(loadWatchlist());
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
  const lastKey = useRef<string>("");

  const load = useCallback(async (force = false) => {
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
      });
      const data = await readJsonOrThrow<{ rows: TrendRow[] }>(
        res,
        "Could not load trend signals"
      );
      setRows(data.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load trend signals");
    } finally {
      setBusy(false);
    }
  }, [key]);

  // Weekly indicators barely move intraday, so fetch once per ticker set
  // rather than polling. The button is there for a manual recheck.
  useEffect(() => {
    if (!key || lastKey.current === key) return;
    lastKey.current = key;
    void load();
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
    const next = [...watchlist, symbol];
    setWatchlist(next);
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
    setDraft("");
    setAddError(null);
  }, [draft, holdingSet, watchlist, combined.length]);

  const removeFromWatchlist = useCallback((symbol: string) => {
    setWatchlist((prev) => {
      const next = prev.filter((t) => t !== symbol);
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const changing = (rows ?? []).filter(
    (r) => r.divergence || r.regime === "weakening" || r.regime === "recovering"
  );
  const leaders = [...(rows ?? [])]
    .filter((r) => r.rs13 != null)
    .sort((a, b) => (b.rs13 ?? 0) - (a.rs13 ?? 0));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">
              Is the trend changing?
            </p>
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-zinc-400">
              Everything here runs on weekly bars, so it answers &quot;has the
              story changed&quot; rather than &quot;what happened today&quot;.
              A signal that fired every week would be noise.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={busy}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
            {busy ? "Reading …" : "Recheck"}
          </button>
        </div>

        <div className="mt-4 border-t border-zinc-800 pt-4">
          <p className="text-xs font-medium text-zinc-300">
            Watch anything, not just what you hold
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
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
              className="h-8 w-40 rounded-md border border-zinc-700 bg-black/20 px-2.5 text-xs text-white placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={addToWatchlist}
              disabled={!draft.trim()}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-40"
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
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {rows == null && !error && (
        <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 px-4 py-10 text-center text-sm text-zinc-400">
          Reading four years of weekly bars …
        </div>
      )}

      {rows != null && rows.length === 0 && !error && (
        <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 px-4 py-10 text-center text-sm text-zinc-400">
          Add a holding, or watch a ticker above, and its trend read shows up
          here.
        </div>
      )}

      {rows != null && rows.length > 0 && (
        <>
          {/* The headline: only names whose story is actually shifting. */}
          <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4 sm:p-5">
            <p className="text-sm font-semibold text-white">What&apos;s shifting</p>
            <p className="mt-0.5 mb-4 text-xs leading-relaxed text-zinc-400">
              A divergence means price and momentum disagree: the move is
              still going, but with less force behind it than last time. That
              is usually the first crack, not the break itself.
            </p>
            {changing.length === 0 ? (
              <p className="text-sm text-zinc-400">
                Nothing is diverging or rolling over right now. Trends are
                doing what they were already doing.
              </p>
            ) : (
              <ul className="space-y-2">
                {changing.map((r) => {
                  const d = r.divergence;
                  const bearish = d?.kind === "bearish";
                  return (
                    <li
                      key={r.ticker}
                      className={cn(
                        "rounded-lg border px-3 py-2.5",
                        d
                          ? bearish
                            ? "border-rose-500/30 bg-rose-950/20"
                            : "border-emerald-500/30 bg-emerald-950/20"
                          : "border-amber-500/25 bg-amber-950/10"
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-white">
                          {cashtag(r.ticker)}
                        </span>
                        {d ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
                              bearish
                                ? "bg-rose-500/15 text-rose-200"
                                : "bg-emerald-500/15 text-emerald-200"
                            )}
                          >
                            {bearish ? (
                              <ArrowDownRight className="h-3 w-3" />
                            ) : (
                              <ArrowUpRight className="h-3 w-3" />
                            )}
                            {bearish ? "Bearish" : "Bullish"} divergence
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-200">
                            <AlertTriangle className="h-3 w-3" />
                            {REGIME_COPY[r.regime].label}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                        {d
                          ? `Price made a ${bearish ? "higher high" : "lower low"} (${d.priceFrom.toFixed(0)} to ${d.priceTo.toFixed(0)}) while RSI went the other way (${d.rsiFrom.toFixed(0)} to ${d.rsiTo.toFixed(0)}). Confirmed ${d.weeksAgo === 0 ? "this week" : `${d.weeksAgo}w ago`}.`
                          : REGIME_COPY[r.regime].blurb}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Rotation: who is taking leadership from whom. */}
          <div className="rounded-xl border border-zinc-800 bg-[#161618]/80 p-4 sm:p-5">
            <p className="text-sm font-semibold text-white">
              Who&apos;s leading, who&apos;s fading
            </p>
            <p className="mt-0.5 mb-4 text-xs leading-relaxed text-zinc-400">
              Performance against the S&amp;P over the last quarter and half
              year. Beating the index is what rotation actually means: money
              moving toward a theme, not just a stock going up with everything
              else.
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
                    <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-zinc-400 sm:inline-block">
                      {rsText(r.rs26)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex justify-end gap-3 text-xs text-zinc-400">
              <span className="w-16 text-right">13w</span>
              <span className="hidden w-16 text-right sm:inline-block">26w</span>
            </div>
          </div>

          {/* The full read, for anyone who wants the numbers. */}
          <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-[#161618]/80">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-2.5 font-medium">Ticker</th>
                  <th className="px-4 py-2.5 font-medium">Trend</th>
                  <th
                    className="px-4 py-2.5 font-medium"
                    title="Weekly RSI(14). Over 70 is stretched, under 30 is washed out."
                  >
                    RSI
                  </th>
                  <th
                    className="px-4 py-2.5 font-medium"
                    title="Whether weekly MACD momentum is building or fading"
                  >
                    Momentum
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ticker} className="border-b border-zinc-800/60">
                    <td className="px-4 py-2 font-medium text-zinc-100">
                      {cashtag(r.ticker)}
                      {!holdingSet.has(r.ticker) && (
                        <span className="ml-1.5 text-xs font-normal uppercase tracking-wide text-zinc-400">
                          watching
                        </span>
                      )}
                    </td>
                    <td
                      className={cn("px-4 py-2", REGIME_COPY[r.regime].tone)}
                      title={REGIME_COPY[r.regime].blurb}
                    >
                      {REGIME_COPY[r.regime].label}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2 tabular-nums",
                        r.rsi == null
                          ? "text-zinc-400"
                          : r.rsi >= 70
                            ? "text-amber-300"
                            : r.rsi <= 30
                              ? "text-sky-300"
                              : "text-zinc-300"
                      )}
                    >
                      {r.rsi?.toFixed(0) ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      {r.macdBuilding == null ? (
                        <span className="text-zinc-400">—</span>
                      ) : (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            r.macdBuilding ? "text-gain" : "text-zinc-400"
                          )}
                        >
                          {r.macdBuilding ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <Minus className="h-3 w-3" />
                          )}
                          {r.macdBuilding ? "Building" : "Fading"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="px-1 text-xs text-zinc-400">
            Technical readings on past prices, not a forecast and not advice.
            Divergences can persist for months before anything happens, or
            resolve with no break at all.
          </p>
        </>
      )}
    </div>
  );
}
