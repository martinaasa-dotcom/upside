"use client";

import { cn } from "@/lib/format";
import { OVERVIEW_TAB_ID } from "@/lib/overview";
import type { Portfolio } from "@/lib/types";
import { LayoutDashboard, MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = {
  portfolios: Portfolio[];
  activeId: string;
  onChange: (id: string) => void;
  onAdd: (name: string) => void;
  onRenameRequest?: (id: string, name: string) => void;
  onDeleteRequest?: (id: string, name: string) => void;
};

export function PortfolioTabs({
  portfolios,
  activeId,
  onChange,
  onAdd,
  onRenameRequest,
  onDeleteRequest,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const overviewActive = activeId === OVERVIEW_TAB_ID;

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    onAdd(trimmed);
    setName("");
    setAdding(false);
  }

  useEffect(() => {
    if (!menuId) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuId(null);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuId]);

  return (
    <nav className="sticky bottom-0 z-20 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-1 overflow-x-auto px-3 py-2">
        <button
          type="button"
          onClick={() => onChange(OVERVIEW_TAB_ID)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm transition",
            overviewActive
              ? "rounded-lg border border-emerald-500/40 bg-emerald-500/15 font-semibold text-emerald-300 shadow-sm shadow-emerald-500/10"
              : "rounded-lg border border-transparent text-zinc-400 hover:bg-zinc-900/70 hover:text-zinc-200"
          )}
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          Overview
        </button>

        <div className="mx-1 h-6 w-px shrink-0 bg-zinc-800" aria-hidden />

        {portfolios.map((p) => {
          const active = p.id === activeId;
          return (
            <div key={p.id} className="relative flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => onChange(p.id)}
                onDoubleClick={() => onRenameRequest?.(p.id, p.name)}
                className={cn(
                  "px-3 py-2 text-sm transition sm:px-4",
                  active
                    ? "rounded-l-lg border border-r-0 border-zinc-600 bg-zinc-800 font-semibold text-white shadow-sm"
                    : "rounded-l-lg border border-r-0 border-transparent text-zinc-400 hover:bg-zinc-900/70 hover:text-zinc-200"
                )}
              >
                {p.name}
              </button>
              <button
                type="button"
                onClick={() => setMenuId((id) => (id === p.id ? null : p.id))}
                className={cn(
                  "rounded-r-lg border px-1.5 py-2 text-zinc-500 transition hover:text-zinc-200",
                  active
                    ? "border-zinc-600 bg-zinc-800"
                    : "border-transparent hover:bg-zinc-900/70"
                )}
                aria-label={`Options for ${p.name}`}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              {menuId === p.id && (
                <div
                  ref={menuRef}
                  className="absolute bottom-full left-0 z-30 mb-1 min-w-[9rem] rounded-lg border border-zinc-700 bg-zinc-950 py-1 shadow-xl"
                >
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900"
                    onClick={() => {
                      setMenuId(null);
                      onRenameRequest?.(p.id, p.name);
                    }}
                  >
                    Rename
                  </button>
                  {onDeleteRequest && portfolios.length > 1 && (
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-rose-300 hover:bg-zinc-900"
                      onClick={() => {
                        setMenuId(null);
                        onDeleteRequest(p.id, p.name);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {adding ? (
          <form
            className="flex shrink-0 items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={submit}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setAdding(false);
                  setName("");
                }
              }}
              placeholder="Sheet name"
              className="w-32 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-sm text-white outline-none focus:border-emerald-500"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-sm text-zinc-400 transition hover:border-emerald-500/50 hover:text-emerald-400"
            aria-label="Add sheet"
          >
            <Plus className="h-3.5 w-3.5" />
            New sheet
          </button>
        )}
      </div>
    </nav>
  );
}
