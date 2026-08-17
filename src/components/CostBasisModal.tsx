"use client";

import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { Button } from "@/components/ui/button";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { TickerSymbol } from "@/components/TickerSymbol";
import { listingCurrenciesAreMixed } from "@/lib/listing-currency";
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

  const mixedListings = listingCurrenciesAreMixed(
    rows.map((row) => ({ ticker: row.ticker }))
  );

  return (
    <ViewportOverlay className="z-[85] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/10 backdrop-blur-xs"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl bg-popover ring-1 ring-foreground/10">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              What you paid
            </h3>
            <p className="text-sm text-muted-foreground">
              The import used today&apos;s prices as what you paid. Type your
              real average buy price in dollars, then apply, so the gain and
              loss numbers are right.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-3.5 text-muted-foreground hover:bg-accent hover:text-foreground sm:p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 gap-2 overflow-y-auto px-4 py-3">
          {rows.map((r) => (
            <label
              key={r.ticker}
              className="grid grid-cols-[1fr_7rem] items-center gap-2 text-sm text-muted-foreground"
            >
              <span>
                <span className="inline-flex font-semibold text-foreground">
                  <TickerSymbol
                    ticker={r.ticker}
                    showCurrency={mixedListings}
                  />
                </span>
                <span className="ml-2 text-muted-foreground">
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
                className="w-[6.5rem]"
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Skip
          </Button>
          <Button type="button" onClick={onApply}>
            Apply costs
          </Button>
        </div>
      </div>
    </ViewportOverlay>
  );
}
