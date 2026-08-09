"use client";

import { blockWheelChange, parseDecimal } from "@/lib/number-input";
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

  useEffect(() => {
    if (!open) return;
    setCash(String(initialCash));
  }, [open, initialCash]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseDecimal(cash);
    if (Number.isNaN(n)) return;
    onSave(n);
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
            <h3 className="text-base font-semibold text-white">Edit cash</h3>
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

        <label className="grid gap-1 text-xs text-zinc-400">
          Cash balance (can be negative)
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            value={cash}
            onChange={(e) =>
              setCash(
                e.target.value.replace(/,/g, ".").replace(/[^\d.-]/g, "")
              )
            }
            onWheel={blockWheelChange}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
            required
          />
        </label>

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
