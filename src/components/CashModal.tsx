"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { isSafeSignedMoney } from "@/lib/input-guard";
import { blockWheelChange, parseDecimal } from "@/lib/number-input";
import { roundMoney } from "@/lib/money";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  portfolioName: string;
  initialCash: number;
  /** Paper class sheets can go below zero. Real books cannot. */
  allowNegative?: boolean;
  onClose: () => void;
  onSave: (cash: number) => void;
};

export function CashModal({
  open,
  portfolioName,
  initialCash,
  allowNegative = false,
  onClose,
  onSave,
}: Props) {
  const [cash, setCash] = useState(String(initialCash));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCash(String(initialCash));
    setError(null);
    setBusy(false);
  }, [open, initialCash]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const n = parseDecimal(cash);
    if (!isSafeSignedMoney(n)) {
      setError("That has to be a real dollar amount, not enormous.");
      return;
    }
    if (!allowNegative && n < 0) {
      setError("Cash on a real portfolio cannot go below zero.");
      return;
    }
    setBusy(true);
    onSave(roundMoney(n));
  }

  return (
    <ViewportOverlay
      className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClose={onClose}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="relative max-h-full w-full max-w-md overflow-y-auto rounded-t-xl bg-popover ring-1 ring-foreground/20 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-xl sm:pb-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Edit cash</h3>
            <p className="text-sm text-muted-foreground">{portfolioName}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            className="touch-target sm:size-7"
          >
            <X />
          </Button>
        </div>

        <label className="grid gap-1 text-sm text-muted-foreground">
          {allowNegative
            ? "Paper cash. Buys spend it, sells add it back."
            : "Money sitting ready, not yet in a stock."}
          <Input
            autoFocus
            type="text"
            inputMode="decimal"
            value={cash}
            onChange={(e) => {
              setCash(
                e.target.value
                  .replace(/,/g, ".")
                  .replace(allowNegative ? /[^\d.-]/g : /[^\d.]/g, "")
              );
              setError(null);
            }}
            onWheel={blockWheelChange}
            className="tabular-nums"
            required
          />
        </label>

        {error && <p className="mt-3 text-sm text-loss">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </ViewportOverlay>
  );
}
