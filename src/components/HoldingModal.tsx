"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { blockWheelChange, parseDecimal } from "@/lib/number-input";

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

  useEffect(() => {
    if (!open) return;
    setTicker("");
    setShares("");
    setBuyPrice("");
    setTargetCall("15");
  }, [open]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sharesN = Math.round(parseDecimal(shares));
    const buyN = parseDecimal(buyPrice);
    const callN = Math.round(parseDecimal(targetCall));
    if (!ticker.trim() || !sharesN || !buyN || Number.isNaN(callN)) return;

    onSave({
      ticker: ticker.trim().toUpperCase(),
      shares: sharesN,
      buy_price: Math.round(buyN * 100) / 100,
      target_call_pct: callN / 100,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="relative w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">Add holding</h3>
            <p className="text-xs text-zinc-500">{portfolioName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
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
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              placeholder="NBIS"
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs text-zinc-400">
              Shares
              <input
                type="text"
                inputMode="numeric"
                value={shares}
                onChange={(e) => setShares(e.target.value.replace(/[^\d]/g, ""))}
                onWheel={blockWheelChange}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                required
              />
            </label>
            <label className="grid gap-1 text-xs text-zinc-400">
              Buy price
              <input
                type="text"
                inputMode="decimal"
                value={buyPrice}
                onChange={(e) =>
                  setBuyPrice(
                    e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "")
                  )
                }
                onWheel={blockWheelChange}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
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
              onChange={(e) =>
                setTargetCall(e.target.value.replace(/[^\d]/g, ""))
              }
              onWheel={blockWheelChange}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            />
          </label>
        </div>

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
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
