"use client";

import { CLASS_CASH_PRESETS, formatCashDigits, parseCashDigits } from "@/lib/class-templates";
import { MAX_STARTING_CASH, MIN_STARTING_CASH } from "@/lib/classroom";
import { cn } from "@/lib/format";
import { useEffect, useState } from "react";

export function StartingCashField({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(`$${formatCashDigits(value)}`);

  useEffect(() => {
    setText(`$${formatCashDigits(value)}`);
  }, [value]);

  return (
    <div>
      <p className="text-xs font-medium text-zinc-400">Starting cash</p>
      <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
        Every student gets this on a paper sheet. Same number for the whole
        class.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {CLASS_CASH_PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-sm tabular-nums transition disabled:opacity-50",
              value === n
                ? "bg-brand/20 font-semibold text-brand-bright"
                : "border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:text-white"
            )}
          >
            ${formatCashDigits(n)}
          </button>
        ))}
      </div>
      <input
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={text}
        aria-label="Starting cash"
        onChange={(e) => {
          const parsed = parseCashDigits(e.target.value);
          if (parsed == null) {
            setText("");
            return;
          }
          const next = Math.min(MAX_STARTING_CASH, parsed);
          setText(`$${formatCashDigits(next)}`);
          if (next >= MIN_STARTING_CASH) onChange(next);
        }}
        className="mt-2 w-full max-w-xs rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm tabular-nums text-zinc-100 outline-none focus:border-brand/50 disabled:opacity-50"
      />
    </div>
  );
}
