"use client";

import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { cashtag } from "@/lib/format";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  isSafePositiveMoney,
  isSafeShares,
  sanitizeTickerQuery,
} from "@/lib/input-guard";
import {
  localTickerSuggestions,
  looksLikeTickerQuery,
  mergeAndRankTickerSuggestions,
  pickTickerSuggestion,
} from "@/lib/market/ticker-search";
import { useTickerSearch } from "@/lib/use-ticker-search";
import { blockWheelChange, parseDecimal } from "@/lib/number-input";
import { roundMoney, roundShares } from "@/lib/money";
import {
  isPlausibleTicker,
  normalizeYahooTicker,
  tickerExchangeHint,
} from "@/lib/ticker";
import {
  listingAmountToUsd,
  listingCurrency,
  usdPerMapFromFx,
} from "@/lib/listing-currency";
import { ListingCurrencyChip } from "@/components/TickerSymbol";

export type HoldingFormValues = {
  ticker: string;
  shares: number;
  buy_price: number;
  target_call_pct: number;
};

type Props = {
  open: boolean;
  portfolioName: string;
  onClose: () => void;
  onSave: (values: HoldingFormValues) => void;
  /** Hide the Target call % field for viewers with no options experience
   * — still submits with the same default, they just never see or think
   * about it. */
  hideCallPct?: boolean;
};

export function HoldingModal({
  open,
  portfolioName,
  onClose,
  onSave,
  hideCallPct = false,
}: Props) {
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [targetCall, setTargetCall] = useState("15");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const remote = useTickerSearch(open ? ticker : "");
  const suggestions = useMemo(
    () =>
      mergeAndRankTickerSuggestions(
        ticker,
        localTickerSuggestions(ticker, [], new Set()),
        remote,
        new Set()
      ),
    [ticker, remote]
  );

  useEffect(() => {
    if (!open) return;
    setTicker("");
    setShares("");
    setBuyPrice("");
    setTargetCall("15");
    setError(null);
    setBusy(false);
    setListOpen(false);
  }, [open]);

  if (!open) return null;

  async function resolveHoldingTicker(raw: string): Promise<string> {
    const picked = pickTickerSuggestion(raw, suggestions);
    if (picked?.symbol) return normalizeYahooTicker(picked.symbol);
    if (looksLikeTickerQuery(raw)) return normalizeYahooTicker(raw);
    try {
      const res = await fetch(
        `/api/market/search?q=${encodeURIComponent(raw)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return "";
      const data = (await res.json()) as {
        results?: { symbol: string; name: string | null }[];
      };
      const hit = pickTickerSuggestion(raw, data.results ?? []);
      return hit?.symbol ? normalizeYahooTicker(hit.symbol) : "";
    } catch {
      return "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const sharesN = parseDecimal(shares);
    const buyN = parseDecimal(buyPrice);
    const callN = Math.round(parseDecimal(targetCall));
    const normalizedTicker = await resolveHoldingTicker(ticker.trim());
    if (!normalizedTicker) {
      setError("Type a ticker or a company name.");
      return;
    }
    if (!isPlausibleTicker(normalizedTicker)) {
      setError("That ticker doesn't look like a real symbol.");
      return;
    }
    if (!isSafeShares(sharesN)) {
      setError("Share count has to be bigger than 0 and not enormous.");
      return;
    }
    if (!isSafePositiveMoney(buyN)) {
      setError("Buy price has to be bigger than 0 and not enormous.");
      return;
    }
    if (!Number.isFinite(callN) || callN < 0 || callN > 100) {
      setError("That has to be a number between 0 and 100.");
      return;
    }

    setBusy(true);
    let buyUsd = roundMoney(buyN);
    const buyCode = listingCurrency(normalizedTicker);
    if (buyCode !== "USD") {
      try {
        const fxRes = await fetch(
          `/api/quotes?tickers=${encodeURIComponent(normalizedTicker)}`,
          { cache: "no-store" }
        );
        if (!fxRes.ok) {
          setBusy(false);
          setError("Couldn't convert that buy price. Try again in a second.");
          return;
        }
        const fxJson = (await fxRes.json()) as {
          fx?: {
            eurUsd?: number | null;
            gbpUsd?: number | null;
            usdPer?: Record<string, number | null | undefined>;
          };
        };
        const rates = usdPerMapFromFx(fxJson.fx);
        if (!(rates[buyCode] > 0)) {
          setBusy(false);
          setError("Couldn't convert that buy price. Try again in a second.");
          return;
        }
        buyUsd = listingAmountToUsd(buyN, buyCode, rates);
      } catch {
        setBusy(false);
        setError("Couldn't convert that buy price. Try again in a second.");
        return;
      }
    }
    onSave({
      ticker: normalizedTicker,
      shares: roundShares(sharesN),
      buy_price: buyUsd,
      target_call_pct: callN / 100,
    });
  }

  const normalized = looksLikeTickerQuery(ticker)
    ? normalizeYahooTicker(ticker)
    : pickTickerSuggestion(ticker, suggestions)?.symbol ?? "";
  const exchangeHint = normalized ? tickerExchangeHint(normalized) : null;
  const buyCode = normalized ? listingCurrency(normalized) : "USD";

  return (
    <ViewportOverlay className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={(e) => void submit(e)}
        className="relative max-h-full w-full overflow-y-auto rounded-t-2xl border border-border bg-well p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-2xl sm:pb-5"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Add holding</h3>
            <p className="text-sm text-muted">{portfolioName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-3.5 text-muted hover:bg-hover hover:text-foreground sm:p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3">
          <label className="grid gap-1 text-sm text-muted">
            Ticker or company
            <div className="relative">
              <input
                autoFocus
                value={ticker}
                onChange={(e) => {
                  setTicker(sanitizeTickerQuery(e.target.value));
                  setListOpen(true);
                  setError(null);
                }}
                onFocus={() => {
                  if (ticker.trim()) setListOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && suggestions[0] && listOpen) {
                    e.preventDefault();
                    setTicker(suggestions[0]!.symbol);
                    setListOpen(false);
                  }
                }}
                className="w-full rounded-lg border border-border bg-well px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
                placeholder="Apple, NVDA, or SPY5"
                required
                autoComplete="off"
              />
              {listOpen && suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-well shadow-xl">
                  {suggestions.map((row) => (
                    <li key={row.symbol}>
                      <button
                        type="button"
                        className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm text-foreground hover:bg-hover"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setTicker(row.symbol);
                          setListOpen(false);
                        }}
                      >
                        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                          {cashtag(row.symbol)}
                          <ListingCurrencyChip code={listingCurrency(row.symbol)} />
                        </span>
                        {row.name && (
                          <span className="truncate text-muted">{row.name}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <span className="text-sm leading-relaxed text-muted">
              Type the ticker or the company. London:{" "}
              <span className="text-muted">TICKER.L</span>. Xetra:{" "}
              <span className="text-muted">SPY5</span> or{" "}
              <span className="text-muted">TICKER.DE</span>. Tallinn:{" "}
              <span className="text-muted">LHV1T</span>. Average buy in this
              listing&apos;s money
              {buyCode !== "USD" ? ` (${buyCode})` : ""}.
              {exchangeHint && normalized !== ticker.trim().toUpperCase() && (
                <> → {normalized}</>
              )}
              {exchangeHint && <> · {exchangeHint}</>}
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm text-muted">
              Shares
              <input
                type="text"
                inputMode="decimal"
                value={shares}
                onChange={(e) => {
                  setShares(
                    e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "")
                  );
                  setError(null);
                }}
                onWheel={blockWheelChange}
                className="rounded-lg border border-border bg-well px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
                required
              />
            </label>
            <label className="grid gap-1 text-sm text-muted">
              Average buy{buyCode !== "USD" ? ` (${buyCode})` : ""}
              <input
                type="text"
                inputMode="decimal"
                value={buyPrice}
                onChange={(e) => {
                  setBuyPrice(
                    e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "")
                  );
                  setError(null);
                }}
                onWheel={blockWheelChange}
                className="rounded-lg border border-border bg-well px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
                required
              />
            </label>
          </div>
          {!hideCallPct && (
            <label className="grid gap-1 text-sm text-muted">
              How far above your target to sell (%)
              <input
                type="text"
                inputMode="numeric"
                value={targetCall}
                onChange={(e) => {
                  setTargetCall(e.target.value.replace(/[^\d]/g, ""));
                  setError(null);
                }}
                onWheel={blockWheelChange}
                className="rounded-lg border border-border bg-well px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
              />
            </label>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-loss">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-well hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </ViewportOverlay>
  );
}
