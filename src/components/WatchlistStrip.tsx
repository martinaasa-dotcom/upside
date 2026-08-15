"use client";

import { cashtag, cn, percent, signedTone } from "@/lib/format";
import { sanitizeTickerDraft } from "@/lib/input-guard";
import { quotesUrl } from "@/lib/market/session";
import {
  localTickerSuggestions,
  mergeTickerSuggestions,
  type TickerSuggestion,
} from "@/lib/market/ticker-search";
import { FALLBACK_POPULAR_TICKERS } from "@/lib/popular-tickers";
import type { Quote } from "@/lib/types";
import {
  addWatchlistTicker,
  loadWatchlist,
  removeWatchlistTicker,
} from "@/lib/watchlist";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/** Stable server-side value; a fresh [] each render would churn the memo. */
const EMPTY_LIST: string[] = [];
const POPULAR_SEED = [...FALLBACK_POPULAR_TICKERS];

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
  const [popular, setPopular] = useState<string[]>(POPULAR_SEED);
  const [remote, setRemote] = useState<TickerSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLFormElement>(null);
  const searchGen = useRef(0);

  const heldKey = heldTickers.join("|");
  const names = useMemo(() => {
    const held = new Set(heldTickers.map((t) => t.toUpperCase()));
    return list.filter((t) => !held.has(t)).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- heldKey stands in for the array's contents
  }, [list, heldKey]);
  const namesKey = useMemo(() => names.join("|"), [names]);

  const exclude = useMemo(() => {
    const next = new Set(heldTickers.map((t) => t.toUpperCase()));
    for (const t of list) next.add(t.toUpperCase());
    return next;
  }, [heldTickers, list]);

  const suggestions = useMemo(
    () => mergeTickerSuggestions(localTickerSuggestions(draft, popular, exclude), remote, exclude),
    [draft, popular, remote, exclude]
  );

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

  useEffect(() => {
    const ctrl = new AbortController();
    void fetch("/api/popular-tickers", { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { tickers?: string[] } | null) => {
        if (ctrl.signal.aborted) return;
        if (data?.tickers?.length) setPopular(data.tickers);
      })
      .catch(() => {
        /* keep the fallback list */
      });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    const q = draft.trim();
    if (q.length < 1) {
      setRemote([]);
      return;
    }
    const gen = ++searchGen.current;
    const timer = window.setTimeout(() => {
      void fetch(`/api/market/search?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { results?: TickerSuggestion[] } | null) => {
          if (searchGen.current !== gen) return;
          setRemote(Array.isArray(data?.results) ? data.results : []);
        })
        .catch(() => {
          if (searchGen.current === gen) setRemote([]);
        });
    }, 220);
    return () => {
      window.clearTimeout(timer);
    };
  }, [draft]);

  useEffect(() => {
    setActive(0);
  }, [draft, suggestions.length]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function add(symbol?: string) {
    const t = (symbol ?? draft).trim().toUpperCase();
    if (!/^[A-Z0-9.=^-]{1,12}$/.test(t)) return;
    if (heldTickers.some((h) => h.toUpperCase() === t)) return;
    const next = addWatchlistTicker(list, t);
    setList(next);
    setDraft("");
    setRemote([]);
    setOpen(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">Watching</p>
        <form
          ref={boxRef}
          className="relative flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            add(suggestions[active]?.symbol ?? draft);
          }}
        >
          <input
            value={draft}
            onChange={(e) => {
              setDraft(sanitizeTickerDraft(e.target.value).slice(0, 12));
              setOpen(true);
            }}
            onFocus={() => {
              if (draft.trim()) setOpen(true);
            }}
            onKeyDown={(e) => {
              if (!open || suggestions.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => (i + 1) % suggestions.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              }
            }}
            placeholder="Add a name"
            maxLength={12}
            autoComplete="off"
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-controls="watchlist-suggest"
            aria-autocomplete="list"
            aria-activedescendant={
              open && suggestions[active]
                ? `watchlist-suggest-${suggestions[active]!.symbol}`
                : undefined
            }
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
          {open && suggestions.length > 0 && (
            <ul
              id="watchlist-suggest"
              role="listbox"
              className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl"
            >
              {suggestions.map((row, i) => (
                <li key={row.symbol} role="presentation">
                  <button
                    id={`watchlist-suggest-${row.symbol}`}
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    className={cn(
                      "flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left",
                      i === active ? "bg-zinc-900" : "hover:bg-zinc-900"
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => add(row.symbol)}
                  >
                    <span className="text-sm font-medium text-white">
                      {cashtag(row.symbol)}
                    </span>
                    {row.name && (
                      <span className="truncate text-xs text-zinc-500">
                        {row.name}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
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
                className="flex h-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-app/40 px-3 py-2"
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
