"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { blockWheelChange, parseDecimal } from "@/lib/number-input";
import { roundMoney, roundShares } from "@/lib/money";
import { normalizeYahooTicker, tickerExchangeHint } from "@/lib/ticker";

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
};

export function HoldingModal({
  open,
  portfolioName,
  onClose,
  onSave,
}: Props) {
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [targetCall, setTargetCall] = useState("15");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTicker("");
    setShares("");
    setBuyPrice("");
    setTargetCall("15");
    setError(null);
  }, [open]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sharesN = parseDecimal(shares);
    const buyN = parseDecimal(buyPrice);
    const callN = Math.round(parseDecimal(targetCall));
    if (!ticker.trim()) {
      setError("Ticker is required");
      return;
    }
    if (!Number.isFinite(sharesN) || sharesN <= 0) {
      setError("Shares must be a positive number");
      return;
    }
    if (!Number.isFinite(buyN) || buyN <= 0) {
      setError("Buy price must be a positive number");
      return;
    }
    if (!Number.isFinite(callN) || callN < 0 || callN > 100) {
      setError("Target call % must be 0–100");
      return;
    }

    onSave({
      ticker: normalizeYahooTicker(ticker),
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
        className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">Add holding</h3>
            <p className="text-xs text-zinc-500">{portfolioName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-3.5 text-zinc-400 hover:bg-zinc-800 hover:text-white sm:p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3">
          <label className="grid gap-1 text-xs text-zinc-400">
            Ticker
            <input
              autoFocus
              value={ticker}
              onChange={(e) => {
                setTicker(e.target.value.toUpperCase());
                setError(null);
              }}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
              placeholder="NBIS or VWCE.DE / VUSA.L"
              required
            />
            <span className="text-[11px] leading-relaxed text-zinc-600">
              US: bare symbol. London:{" "}
              <span className="text-zinc-400">TICKER.L</span> or{" "}
              <span className="text-zinc-400">LON:TICKER</span>. Xetra:{" "}
              <span className="text-zinc-400">TICKER.DE</span>. Buy price in USD.
              {exchangeHint && normalized !== ticker.trim().toUpperCase() && (
                <> → {normalized}</>
              )}
              {exchangeHint && <> · {exchangeHint}</>}
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs text-zinc-400">
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
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
                required
              />
            </label>
            <label className="grid gap-1 text-xs text-zinc-400">
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
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
                required
              />
            </label>
          </div>
          <label className="grid gap-1 text-xs text-zinc-400">
            Target call % (OTM)
            <input
              type="text"
              inputMode="numeric"
              value={targetCall}
              onChange={(e) => {
                setTargetCall(e.target.value.replace(/[^\d]/g, ""));
                setError(null);
              }}
              onWheel={blockWheelChange}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-[#121214] hover:bg-brand-bright"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
