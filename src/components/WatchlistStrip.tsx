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
import { quoteAsOfTitle } from "@/lib/market/quote-freshness";
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
import { Input } from "@/components/ui/input";
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
    <div className="flex flex-col gap-6">
      <PanelHeader
        title="Watching"
        subtitle={
          names.length === 0
            ? "Names you don't own. Add one to see the price, the recent range, and whether now looks quiet or rushed."
            : "Today's price and a plain read of the last few weeks. Not a buy order."
        }
        actions={
          <form
            ref={boxRef}
            className="relative flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void add(suggestions[active]?.symbol);
            }}
          >
          <Input
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
            className="w-40 sm:w-52"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40 lg:size-9"
            aria-label="Add to watchlist"
          >
            <Plus className="size-4" />
          </button>
          {open && suggestions.length > 0 && (
            <ul
              id="watchlist-suggest"
              role="listbox"
              className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-muted shadow-sm"
            >
              {suggestions.map((row, i) => (
                <li key={row.symbol} role="presentation">
                  <button
                    id={`watchlist-suggest-${row.symbol}`}
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    className={cn(
                      "flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left lg:min-h-9",
                      i === active ? "bg-muted" : "hover:bg-muted"
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => add(row.symbol)}
                  >
                    <span className="text-sm font-medium text-foreground">
                      {cashtag(row.symbol)}
                    </span>
                    {row.name && (
                      <span className="truncate text-sm text-muted-foreground">
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
      {names.length === 0 ? null : (
        <>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    "relative flex flex-col rounded-lg border bg-muted p-6",
                    lookBorder(look?.kind)
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setList(removeWatchlistTicker(list, ticker))}
                    className="absolute right-2 top-2 z-10 inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:size-9"
                    aria-label={`Remove ${ticker}`}
                  >
                    <X className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenPulse?.(ticker)}
                    className="flex flex-1 flex-col pr-12 text-left lg:pr-10"
                  >
                    <p className="text-sm font-semibold text-foreground">
                      {cashtag(ticker)}
                    </p>
                    <p
                      className="mt-1 text-sm font-semibold tabular-nums text-foreground"
                      title={quoteAsOfTitle(q)}
                    >
                      {q ? currency(q.price) : "—"}
                    </p>
                    <p
                      className={cn(
                        "text-sm tabular-nums",
                        pct == null ? "text-muted-foreground" : signedTone(pct)
                      )}
                    >
                      {pct == null
                        ? "Waiting on today's price"
                        : `${signedCurrency(q!.change)} today · ${signedPercent(pct)}`}
                    </p>
                    {look?.low != null && look.high != null && (
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        Lately {currency(look.low)} to {currency(look.high)}
                      </p>
                    )}
                    {look && (
                      <>
                        <p className="mt-3 text-sm font-semibold text-foreground">
                          {look.headline}
                        </p>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                          {look.detail}
                        </p>
                      </>
                    )}
                    {onOpenPulse && (
                      <span className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary lg:min-h-9">
                        Check in Pulse
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-muted-foreground">{ADVICE_DISCLAIMER_SHORT}</p>
        </>
      )}
    </div>
  );
}
