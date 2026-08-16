"use client";

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
  onClose: () => void;
  onSave: (cash: number) => void;
};

export function CashModal({
  open,
  portfolioName,
  initialCash,
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
    setBusy(true);
    onSave(roundMoney(n));
  }

  return (
    <ViewportOverlay className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="relative max-h-full w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-well p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-5"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Edit cash</h3>
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

        <label className="grid gap-1 text-sm text-muted">
          Cash balance (can be negative)
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            value={cash}
            onChange={(e) => {
              setCash(
                e.target.value.replace(/,/g, ".").replace(/[^\d.-]/g, "")
              );
              setError(null);
            }}
            onWheel={blockWheelChange}
            className="rounded-lg border border-border bg-well px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
            required
          />
        </label>

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
