"use client";

import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { Input } from "@/components/ui/input";
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
    <ViewportOverlay className="z-[90] flex items-start justify-center px-2 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-3 sm:pt-[12vh]">
      <button
        type="button"
        className="absolute inset-0 bg-black/10 backdrop-blur-xs"
        aria-label="Close command palette"
        onClick={onClose}
      />
      <div className="relative max-h-[min(100%,32rem)] w-full max-w-lg overflow-hidden rounded-xl bg-popover ring-1 ring-foreground/10 sm:max-h-[min(70dvh,32rem)]">
        <Input
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
          placeholder="Jump to portfolio, ticker, unlock, Lab …"
          className="h-auto rounded-none border-0 border-b border-border bg-transparent px-4 py-3 shadow-none dark:bg-transparent"
        />
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
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
                  "flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-3 text-left text-sm sm:py-2",
                  i === active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <span>
                  {item.group && (
                    <span className="mr-2 text-xs text-muted-foreground">
                      {item.group}
                    </span>
                  )}
                  {item.label}
                </span>
                {item.hint && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {item.hint}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-border px-3 py-2 text-sm text-muted-foreground">
          ↑↓ navigate · Enter run · Esc close · ⌘K toggle
        </p>
      </div>
    </ViewportOverlay>
  );
}
