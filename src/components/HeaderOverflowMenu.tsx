"use client";

import { cn } from "@/lib/format";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type HeaderMenuItem = {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
};

type Props = {
  items: HeaderMenuItem[];
  label?: string;
};

export function HeaderOverflowMenu({ items, label = "More" }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest(`[data-header-more="${menuId}"]`)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, menuId]);

  if (items.length === 0) return null;

  return (
    <div className="relative" data-header-more={menuId}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => {
          const rect = btnRef.current?.getBoundingClientRect();
          if (rect) {
            setPos({
              top: rect.bottom + 6,
              right: window.innerWidth - rect.right,
            });
          }
          setOpen((o) => !o);
        }}
        className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1.5 text-xs font-medium text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">{label}</span>
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-header-more={menuId}
            role="menu"
            className="fixed z-[80] min-w-[11rem] overflow-hidden rounded-lg border border-zinc-700 bg-[#1a1a1c] py-1 shadow-xl"
            style={{ top: pos.top, right: pos.right }}
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs",
                  item.disabled
                    ? "cursor-not-allowed text-zinc-600"
                    : item.danger
                      ? "text-rose-300 hover:bg-rose-950/40"
                      : "text-zinc-200 hover:bg-zinc-800"
                )}
              >
                <span>{item.label}</span>
                {item.hint && (
                  <span className="tabular-nums text-[10px] text-zinc-500">
                    {item.hint}
                  </span>
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
