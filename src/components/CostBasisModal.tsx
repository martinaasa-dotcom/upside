"use client";

import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { X } from "lucide-react";

export type CostBasisRow = {
  ticker: string;
  shares: number;
  /** Suggested mark-derived USD cost */
  suggestedBuy: number;
  buyPrice: number;
};

type Props = {
  open: boolean;
  rows: CostBasisRow[];
  onChangeRow: (ticker: string, buyPrice: number) => void;
  onClose: () => void;
  onApply: () => void;
};

/** Post-import pass so mark-as-cost imports can be corrected. */
export function CostBasisModal({
  open,
  rows,
  onChangeRow,
  onClose,
  onApply,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-white">
              Cost basis pass
            </h3>
            <p className="text-xs text-zinc-500">
              Import used market marks as cost. Put in your real average buy
              price (USD) and apply, then ROI actually means something.
            </p>
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
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {rows.map((r) => (
            <label
              key={r.ticker}
              className="grid grid-cols-[1fr_7rem] items-center gap-2 text-xs text-zinc-400"
            >
              <span>
                <span className="font-semibold text-white">{r.ticker}</span>
                <span className="ml-2 text-zinc-600">
                  {r.shares.toLocaleString("en-US")} sh · mark≈$
                  {r.suggestedBuy.toFixed(2)}
                </span>
              </span>
              <FormattedNumberInput
                kind="money"
                currency="USD"
                digits={2}
                value={r.buyPrice}
                onChange={(n) => onChangeRow(r.ticker, n)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-white outline-none focus:border-brand"
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onApply}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-[#121214] hover:bg-brand-bright"
          >
            Apply costs
          </button>
        </div>
      </div>
    </div>
  );
}
