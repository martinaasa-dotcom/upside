"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  isSafePositiveMoney,
  isSafeShares,
  sanitizeTickerDraft,
} from "@/lib/input-guard";
import { blockWheelChange, parseDecimal } from "@/lib/number-input";
import { roundMoney, roundShares } from "@/lib/money";
import {
  isPlausibleTicker,
  normalizeYahooTicker,
  tickerExchangeHint,
} from "@/lib/ticker";

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

  useEffect(() => {
    if (!open) return;
    setTicker("");
    setShares("");
    setBuyPrice("");
    setTargetCall("15");
    setError(null);
    setBusy(false);
  }, [open]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const sharesN = parseDecimal(shares);
    const buyN = parseDecimal(buyPrice);
    const callN = Math.round(parseDecimal(targetCall));
    const normalizedTicker = normalizeYahooTicker(ticker);
    if (!normalizedTicker) {
      setError("Type a ticker first.");
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
    onSave({
      ticker: normalizedTicker,
      shares: roundShares(sharesN),
      buy_price: roundMoney(buyN),
      target_call_pct: callN / 100,
    });
  }

  const normalized = ticker.trim() ? normalizeYahooTicker(ticker) : "";
  const exchangeHint = normalized ? tickerExchangeHint(normalized) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-well p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-2xl sm:pb-5"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Add holding</h3>
            <p className="text-xs text-muted">{portfolioName}</p>
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
          <label className="grid gap-1 text-xs text-muted">
            Ticker
            <input
              autoFocus
              value={ticker}
              onChange={(e) => {
                setTicker(sanitizeTickerDraft(e.target.value));
                setError(null);
              }}
              className="rounded-lg border border-border bg-well px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
              placeholder="NBIS or VWCE.DE / VUSA.L"
              required
            />
            <span className="text-xs leading-relaxed text-muted">
              US: bare symbol. London:{" "}
              <span className="text-muted">TICKER.L</span> or{" "}
              <span className="text-muted">LON:TICKER</span>. Xetra:{" "}
              <span className="text-muted">TICKER.DE</span>. Buy price in USD.
              {exchangeHint && normalized !== ticker.trim().toUpperCase() && (
                <> → {normalized}</>
              )}
              {exchangeHint && <> · {exchangeHint}</>}
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs text-muted">
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
            <label className="grid gap-1 text-xs text-muted">
              Buy price
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
            <label className="grid gap-1 text-xs text-muted">
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
    </div>
  );
}
