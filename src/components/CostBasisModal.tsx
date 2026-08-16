"use client";

import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { cashtag } from "@/lib/format";
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
    <ViewportOverlay className="z-[85] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-well shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              What you paid
            </h3>
            <p className="text-sm text-muted">
              The import used today&apos;s prices as what you paid. Type your
              real average buy price in dollars, then apply, so the gain and
              loss numbers are right.
            </p>
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
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {rows.map((r) => (
            <label
              key={r.ticker}
              className="grid grid-cols-[1fr_7rem] items-center gap-2 text-sm text-muted"
            >
              <span>
                <span className="font-semibold text-foreground">{cashtag(r.ticker)}</span>
                <span className="ml-2 text-muted">
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
                className="rounded-lg border border-border bg-well px-2 py-1.5 text-sm text-foreground outline-none focus:border-brand"
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-well hover:text-foreground"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={onApply}
            className="btn-primary"
          >
            Apply costs
          </button>
        </div>
      </div>
    </ViewportOverlay>
  );
}
