"use client";

import { cashtag, cn, percent, signedTone } from "@/lib/format";
import { quotesUrl } from "@/lib/market/session";
import type { Quote } from "@/lib/types";
import {
  addWatchlistTicker,
  loadWatchlist,
  removeWatchlistTicker,
} from "@/lib/watchlist";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/** Stable server-side value; a fresh [] each render would churn the memo. */
const EMPTY_LIST: string[] = [];

export function WatchlistStrip({
  heldTickers,
  onOpenPulse,
}: {
  heldTickers: string[];
  onOpenPulse?: (ticker?: string) => void;
}) {
  // Watchlist lives in localStorage, so it can't be read during render
  // without the server and client trees disagreeing.
  const [list, setList] = useHydratedCache<string[]>(loadWatchlist, EMPTY_LIST);
  const [draft, setDraft] = useState("");
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  const heldKey = heldTickers.join("|");
  const names = useMemo(() => {
    const held = new Set(heldTickers.map((t) => t.toUpperCase()));
    return list.filter((t) => !held.has(t)).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- heldKey stands in for the array's contents
  }, [list, heldKey]);
  const namesKey = useMemo(() => names.join("|"), [names]);

  const jumps = names
    .map((ticker) => ({
      ticker,
      pct: quotes[ticker]?.changePercent ?? null,
    }))
    .filter(
      (row): row is { ticker: string; pct: number } =>
        row.pct != null && Math.abs(row.pct) >= 0.06
    )
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 2);

  useEffect(() => {
    if (names.length === 0) return;
    const ctrl = new AbortController();
    void fetch(quotesUrl(names), { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { quotes?: Record<string, Quote> } | null) => {
        if (!ctrl.signal.aborted && data?.quotes) setQuotes(data.quotes);
      })
      .catch(() => {
        /* keep last */
      });
    return () => {
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- namesKey stands in for the array's contents
  }, [namesKey]);

  function add() {
    const t = draft.trim().toUpperCase();
    if (!/^[A-Z0-9.=^-]{1,12}$/.test(t)) return;
    const next = addWatchlistTicker(list, t);
    setList(next);
    setDraft("");
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">Watching</p>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
            placeholder="Add a name"
            maxLength={12}
            className="w-24 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-white outline-none placeholder:text-zinc-600 focus:border-brand/50"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-md p-1 text-zinc-400 hover:text-white disabled:opacity-40"
            aria-label="Add to watchlist"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
      {jumps.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {jumps.map((j) => (
            <button
              key={j.ticker}
              type="button"
              onClick={() => onOpenPulse?.(j.ticker)}
              className="w-full rounded-xl border border-amber-500/25 bg-amber-950/20 px-3 py-2 text-left"
            >
              <p className="text-sm tabular-nums text-zinc-200">
                {cashtag(j.ticker)}{" "}
                {j.pct > 0 ? "jumped" : "dropped"} {percent(Math.abs(j.pct))}{" "}
                today. Not in your book.
              </p>
            </button>
          ))}
        </div>
      )}
      {names.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-500">
          Names you don&apos;t own yet. Add one to keep an eye on it.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {names.map((ticker) => {
            const q = quotes[ticker];
            const pct = q?.changePercent ?? null;
            return (
              <li
                key={ticker}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-app/40 px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => onOpenPulse?.(ticker)}
                  className="min-w-0 text-left"
                >
                  <p className="text-sm font-semibold text-white">
                    {cashtag(ticker)}
                  </p>
                  <p
                    className={cn(
                      "text-xs tabular-nums",
                      pct == null ? "text-zinc-500" : signedTone(pct)
                    )}
                  >
                    {pct == null ? "—" : percent(pct)}
                    <span className="ml-1 text-zinc-500">not in book</span>
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setList(removeWatchlistTicker(list, ticker))}
                  className="shrink-0 rounded p-1 text-zinc-600 hover:text-zinc-300"
                  aria-label={`Remove ${ticker}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
