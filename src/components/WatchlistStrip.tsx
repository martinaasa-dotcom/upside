"use client";

import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import {
  cashtag,
  cn,
  currency,
  signedCurrency,
  signedPercent,
  signedTone,
} from "@/lib/format";
import { sanitizeTickerQuery } from "@/lib/input-guard";
import { quotesUrl, isQuotePollFresh } from "@/lib/market/session";
import {
  localTickerSuggestions,
  looksLikeTickerQuery,
  mergeAndRankTickerSuggestions,
  pickTickerSuggestion,
} from "@/lib/market/ticker-search";
import { normalizeYahooTicker } from "@/lib/ticker";
import { useTickerSearch } from "@/lib/use-ticker-search";
import { FALLBACK_POPULAR_TICKERS } from "@/lib/popular-tickers";
import type { Quote } from "@/lib/types";
import { watchLook, type WatchLookKind } from "@/lib/watch-look";
import {
  addWatchlistTicker,
  loadWatchlist,
  removeWatchlistTicker,
} from "@/lib/watchlist";
import { loadCachedQuotes } from "@/lib/quote-cache";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { PanelHeader } from "@/components/ui/Panel";
import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/** Stable server-side value; a fresh [] each render would churn the memo. */
const EMPTY_LIST: string[] = [];
const EMPTY_QUOTES: Record<string, Quote> = {};
const POPULAR_SEED = [...FALLBACK_POPULAR_TICKERS];

function lookBorder(kind: WatchLookKind | undefined): string {
  if (kind === "look") return "border-gain/25";
  if (kind === "wait" || kind === "report") return "border-caution/35";
  return "border-border";
}

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
  const [quotes, setQuotes] = useHydratedCache<Record<string, Quote>>(
    () => loadCachedQuotes().quotes,
    EMPTY_QUOTES
  );
  const [popular, setPopular] = useState<string[]>(POPULAR_SEED);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [reportDays, setReportDays] = useState<Record<string, number>>({});
  const boxRef = useRef<HTMLFormElement>(null);
  const remote = useTickerSearch(draft);

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
    () =>
      mergeAndRankTickerSuggestions(
        draft,
        localTickerSuggestions(draft, popular, exclude),
        remote,
        exclude
      ),
    [draft, popular, remote, exclude]
  );

  useEffect(() => {
    if (names.length === 0) return;
    if (isQuotePollFresh(loadCachedQuotes().savedAt)) return;
    const ctrl = new AbortController();
    void fetch(quotesUrl(names), { signal: ctrl.signal })
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
    if (names.length === 0) {
      setReportDays({});
      return;
    }
    const ctrl = new AbortController();
    void fetch(`/api/market/events?tickers=${encodeURIComponent(names.join(","))}`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (data: { earnings?: Array<{ ticker?: string; days?: number }> } | null) => {
          if (ctrl.signal.aborted) return;
          const next: Record<string, number> = {};
          for (const row of data?.earnings ?? []) {
            const t = String(row.ticker ?? "").toUpperCase();
            if (!t || row.days == null || !Number.isFinite(row.days)) continue;
            next[t] = row.days;
          }
          setReportDays(next);
        }
      )
      .catch(() => {
        /* cards still work without a results date */
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- namesKey stands in for the array's contents
  }, [namesKey]);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetch("/api/popular-tickers", { signal: ctrl.signal })
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
    setActive(0);
  }, [draft, suggestions.length]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function add(symbol?: string) {
    let t = (symbol ?? "").trim();
    if (t && !looksLikeTickerQuery(t)) t = "";
    if (!t) {
      const picked = pickTickerSuggestion(draft, suggestions);
      t = picked?.symbol ?? "";
    }
    if (!t && draft.trim()) {
      try {
        const res = await fetch(
          `/api/market/search?q=${encodeURIComponent(draft.trim())}`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as {
          results?: { symbol: string; name: string | null }[];
        };
        t = pickTickerSuggestion(draft, data.results ?? [])?.symbol ?? "";
      } catch {
        t = "";
      }
    }
    if (!t && looksLikeTickerQuery(draft)) t = normalizeYahooTicker(draft);
    t = normalizeYahooTicker(t);
    if (!/^[A-Z0-9.=^-]{1,12}$/.test(t)) return;
    if (heldTickers.some((h) => h.toUpperCase() === t)) return;
    const next = addWatchlistTicker(list, t);
    setList(next);
    setDraft("");
    setOpen(false);
  }

  return (
    <div>
      <PanelHeader
        title="Watching"
        actions={
          <form
            ref={boxRef}
            className="relative flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void add(suggestions[active]?.symbol);
            }}
          >
          <input
            value={draft}
            onChange={(e) => {
              setDraft(sanitizeTickerQuery(e.target.value));
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
            placeholder="Apple or NVDA"
            maxLength={48}
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
            className="w-40 rounded-md border border-border bg-well px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted focus:border-brand sm:w-52"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-md p-1 text-muted hover:text-foreground disabled:opacity-40"
            aria-label="Add to watchlist"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {open && suggestions.length > 0 && (
            <ul
              id="watchlist-suggest"
              role="listbox"
              className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-well shadow-xl"
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
                      i === active ? "bg-well" : "hover:bg-well"
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => add(row.symbol)}
                  >
                    <span className="text-sm font-medium text-foreground">
                      {cashtag(row.symbol)}
                    </span>
                    {row.name && (
                      <span className="truncate text-sm text-muted">
                        {row.name}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
        }
      />
      {names.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          Names you don&apos;t own. Add one to see the price, the recent
          range, and whether now looks quiet or rushed.
        </p>
      ) : (
        <>
          <p className="mt-5 text-sm text-muted">
            Today&apos;s price and a plain read of the last few weeks. Not a
            buy order.
          </p>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {names.map((ticker) => {
              const q = quotes[ticker];
              const look = q
                ? watchLook(q, reportDays[ticker] ?? null)
                : null;
              const pct = q?.changePercent ?? null;
              return (
                <li
                  key={ticker}
                  className={cn(
                    "flex flex-col rounded-xl border bg-raised",
                    lookBorder(look?.kind)
                  )}
                >
                  <div className="flex items-start justify-between gap-2 px-3 pt-3">
                    <p className="text-sm font-semibold text-foreground">
                      {cashtag(ticker)}
                    </p>
                    <button
                      type="button"
                      onClick={() => setList(removeWatchlistTicker(list, ticker))}
                      className="shrink-0 rounded p-1 text-muted hover:text-foreground/80"
                      aria-label={`Remove ${ticker}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenPulse?.(ticker)}
                    className="flex flex-1 flex-col px-3 pb-3 text-left"
                  >
                    <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                      {q ? currency(q.price) : "—"}
                    </p>
                    <p
                      className={cn(
                        "text-sm tabular-nums",
                        pct == null ? "text-muted" : signedTone(pct)
                      )}
                    >
                      {pct == null
                        ? "Waiting on today's price"
                        : `${signedCurrency(q!.change)} today · ${signedPercent(pct)}`}
                    </p>
                    {look?.low != null && look.high != null && (
                      <p className="mt-1.5 text-sm text-muted">
                        Lately {currency(look.low)} to {currency(look.high)}
                      </p>
                    )}
                    {look && (
                      <>
                        <p className="mt-3 text-sm font-semibold text-foreground">
                          {look.headline}
                        </p>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted">
                          {look.detail}
                        </p>
                      </>
                    )}
                    {onOpenPulse && (
                      <span className="mt-4 text-sm font-medium text-brand-bright">
                        Check in Pulse
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-sm text-muted">{ADVICE_DISCLAIMER_SHORT}</p>
        </>
      )}
    </div>
  );
}
