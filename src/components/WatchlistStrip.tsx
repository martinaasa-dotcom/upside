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
import { watchLook, type WatchLook, type WatchLookKind } from "@/lib/watch-look";
import {
  addWatchlistTicker,
  loadWatchlist,
  removeWatchlistTicker,
} from "@/lib/watchlist";
import { loadCachedQuotes } from "@/lib/quote-cache";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import {
  Card,
  EmptyState,
  MicroLabel,
  PanelHeader,
  Pill,
} from "@/components/ui/Panel";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/** Stable server-side value; a fresh [] each render would churn the memo. */
const EMPTY_LIST: string[] = [];
const EMPTY_QUOTES: Record<string, Quote> = {};
const POPULAR_SEED = [...FALLBACK_POPULAR_TICKERS];

function markerTone(kind: WatchLookKind): string {
  if (kind === "look") return "bg-gain";
  if (kind === "wait" || kind === "report") return "bg-warning";
  return "bg-foreground";
}

function RangeMeter({
  low,
  high,
  price,
  kind,
}: {
  low: number;
  high: number;
  price: number;
  kind: WatchLookKind;
}) {
  const span = high - low;
  const pos = span > 0 ? Math.min(1, Math.max(0, (price - low) / span)) : 0.5;
  return (
    <div>
      <MicroLabel>Recent range</MicroLabel>
      <div className="mt-2 px-1.5">
        <div
          className="relative h-1.5 rounded-full bg-border"
          role="meter"
          aria-valuemin={low}
          aria-valuemax={high}
          aria-valuenow={price}
          aria-label="Where today's price sits in the recent range"
        >
          <span
            className={cn(
              "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-muted",
              markerTone(kind)
            )}
            style={{ left: `${pos * 100}%` }}
          />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-sm tabular-nums text-muted-foreground">
        <span>{currency(low)}</span>
        <span>{currency(high)}</span>
      </div>
    </div>
  );
}

function WatchCard({
  ticker,
  quote,
  look,
  onRemove,
  onOpenPulse,
}: {
  ticker: string;
  quote: Quote | undefined;
  look: WatchLook | null;
  onRemove: () => void;
  onOpenPulse?: (ticker: string) => void;
}) {
  const pct = quote?.changePercent ?? null;
  const waiting = !quote;
  const rangeLow = look?.low ?? null;
  const rangeHigh = look?.high ?? null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-heading text-base font-semibold tracking-tight text-foreground">
          {cashtag(ticker)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          className="touch-target -mr-1.5 -mt-1.5 shrink-0 text-muted-foreground lg:min-h-0 lg:min-w-0"
          aria-label={`Remove ${ticker}`}
        >
          <X />
        </Button>
      </div>

      {waiting ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-24" />
          <p className="text-sm text-muted-foreground">
            Waiting on today&apos;s price
          </p>
        </div>
      ) : (
        <div>
          <p
            className="font-sans text-2xl font-semibold leading-none tracking-tight tabular-nums text-foreground"
            title={quoteAsOfTitle(quote)}
          >
            {currency(quote.price)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {pct == null ? (
              <p className="text-sm text-muted-foreground">
                Waiting on today&apos;s price
              </p>
            ) : (
              <>
                <Pill tone={pct > 0 ? "good" : pct < 0 ? "bad" : "neutral"}>
                  {signedPercent(pct)}
                </Pill>
                <span className={cn("text-sm tabular-nums", signedTone(pct))}>
                  {signedCurrency(quote.change)} today
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {look && rangeLow != null && rangeHigh != null && quote && (
        <RangeMeter
          low={rangeLow}
          high={rangeHigh}
          price={quote.price}
          kind={look.kind}
        />
      )}

      {look && (
        <>
          <Separator />
          <div>
            <p className="font-heading text-lg font-semibold tracking-tight text-foreground">
              {look.headline}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {look.detail}
            </p>
          </div>
        </>
      )}

      {onOpenPulse && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenPulse(ticker)}
          className="mt-auto w-full touch-target justify-between lg:min-h-0"
        >
          Check in Pulse
          <ChevronRight />
        </Button>
      )}
    </Card>
  );
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

  const suggestOpen = open && suggestions.length > 0;

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
            ? undefined
            : "Today's price and a plain read of the last few weeks. Not a buy order."
        }
        actions={
          <Popover
            open={suggestOpen}
            onOpenChange={(next) => {
              if (!next) setOpen(false);
            }}
          >
            <PopoverAnchor asChild>
              <form
                className="relative"
                onSubmit={(e) => {
                  e.preventDefault();
                  void add(suggestions[active]?.symbol);
                }}
              >
                <InputGroup className="w-44 sm:w-56">
                  <InputGroupInput
                    value={draft}
                    onChange={(e) => {
                      setDraft(sanitizeTickerQuery(e.target.value));
                      setOpen(true);
                    }}
                    onFocus={() => {
                      if (draft.trim()) setOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (!suggestOpen) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setActive((i) => (i + 1) % suggestions.length);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActive(
                          (i) => (i - 1 + suggestions.length) % suggestions.length
                        );
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setOpen(false);
                      }
                    }}
                    placeholder="Apple or NVDA"
                    maxLength={48}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={suggestOpen}
                    aria-controls="watchlist-suggest"
                    aria-autocomplete="list"
                    aria-activedescendant={
                      suggestOpen && suggestions[active]
                        ? `watchlist-suggest-${suggestions[active]!.symbol}`
                        : undefined
                    }
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="submit"
                      size="icon-xs"
                      disabled={!draft.trim()}
                      aria-label="Add to watchlist"
                      className="touch-target lg:min-h-0 lg:min-w-0"
                    >
                      <Plus />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </form>
            </PopoverAnchor>
            <PopoverContent
              align="end"
              className="w-64 border-border p-1 shadow-md ring-foreground/20"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <ul id="watchlist-suggest" role="listbox">
                {suggestions.map((row, i) => (
                  <li key={row.symbol} role="presentation">
                    <button
                      id={`watchlist-suggest-${row.symbol}`}
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      className={cn(
                        "flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2.5 text-left lg:min-h-8",
                        i === active
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent hover:text-accent-foreground"
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
            </PopoverContent>
          </Popover>
        }
      />
      {names.length === 0 ? (
        <EmptyState
          title="Nothing on the list yet"
          detail="Add a name you don't own. You'll see today's price, the recent range, and whether now looks quiet or rushed."
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            {names.map((ticker) => {
              const q = quotes[ticker];
              const look = q ? watchLook(q, reportDays[ticker] ?? null) : null;
              return (
                <li key={ticker}>
                  <WatchCard
                    ticker={ticker}
                    quote={q}
                    look={look}
                    onRemove={() => setList(removeWatchlistTicker(list, ticker))}
                    onOpenPulse={onOpenPulse}
                  />
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
