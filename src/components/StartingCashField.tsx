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
      <p className="text-sm font-medium text-muted">Starting cash</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Every student gets this on a paper portfolio. Same number for the whole
        class.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {CLASS_CASH_PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm tabular-nums transition disabled:opacity-50",
              value === n
                ? "bg-select font-semibold text-select-ink"
                : "text-muted hover:bg-hover hover:text-foreground"
            )}
          >
            ${formatCashDigits(n)}
          </button>
        ))}
      </div>
      <label className="mt-4 block">
        <span className="text-sm font-medium text-muted">Or type another amount</span>
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
          className="mt-2 w-full max-w-xs rounded-lg border border-border bg-well px-3 py-2.5 text-sm tabular-nums text-foreground outline-none focus:border-brand disabled:opacity-50"
        />
      </label>
    </div>
  );
}
