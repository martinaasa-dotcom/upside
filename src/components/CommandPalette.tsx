"use client";

import { cn } from "@/lib/format";
import { useEffect, useMemo, useRef, useState } from "react";

export type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  run: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
};

export function CommandPalette({ open, onClose, items }: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(needle) ||
        i.hint?.toLowerCase().includes(needle) ||
        i.group?.toLowerCase().includes(needle)
    );
  }, [items, q]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  if (!open) return null;

  function run(i: number) {
    const item = filtered[i];
    if (!item) return;
    onClose();
    item.run();
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-3 pt-[12vh]">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close command palette"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, filtered.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            }
            if (e.key === "Enter") {
              e.preventDefault();
              run(active);
            }
          }}
          placeholder="Jump to sheet, ticker, unlock, Lab…"
          className="w-full border-b border-zinc-800 bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600"
        />
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-zinc-500">
              No matches
            </li>
          )}
          {filtered.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => run(i)}
                className={cn(
                  "flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm",
                  i === active
                    ? "bg-brand/15 text-brand-bright"
                    : "text-zinc-300 hover:bg-zinc-900"
                )}
              >
                <span>
                  {item.group && (
                    <span className="mr-2 text-[10px] uppercase tracking-wide text-zinc-600">
                      {item.group}
                    </span>
                  )}
                  {item.label}
                </span>
                {item.hint && (
                  <span className="shrink-0 text-[11px] text-zinc-600">
                    {item.hint}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-zinc-800 px-3 py-1.5 text-[10px] text-zinc-600">
          ↑↓ navigate · Enter run · Esc close · ⌘K toggle
        </p>
      </div>
    </div>
  );
}
