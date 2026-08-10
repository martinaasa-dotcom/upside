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
      <div className="mx-auto flex max-w-[1400px] items-center gap-1.5 overflow-x-auto px-3 py-2">
        <button
          type="button"
          onClick={() => onChange(OVERVIEW_TAB_ID)}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm transition",
            overviewActive
              ? "bg-emerald-500/15 font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/40"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          )}
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          Overview
        </button>

        <div className="mx-0.5 h-5 w-px shrink-0 bg-zinc-800" aria-hidden />

        {portfolios.map((p) => {
          const active = p.id === activeId;
          const menuOpen = menuId === p.id;
          return (
            <div
              key={p.id}
              className={cn(
                "relative flex h-9 shrink-0 items-stretch overflow-hidden rounded-lg transition",
                active
                  ? "bg-zinc-800 text-white ring-1 ring-inset ring-zinc-600"
                  : "text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200"
              )}
            >
              <button
                type="button"
                onClick={() => onChange(p.id)}
                onDoubleClick={() => onRenameRequest?.(p.id, p.name)}
                className={cn(
                  "px-3 text-sm transition",
                  active && "font-semibold"
                )}
              >
                {p.name}
              </button>
              <button
                type="button"
                onClick={() => setMenuId((id) => (id === p.id ? null : p.id))}
                className={cn(
                  "flex items-center border-l px-2 transition",
                  active
                    ? "border-zinc-600/80 text-zinc-300 hover:bg-zinc-700/60 hover:text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-200",
                  menuOpen && "bg-zinc-700/50 text-white"
                )}
                aria-label={`Options for ${p.name}`}
                aria-expanded={menuOpen}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
              {menuOpen && (
                <div
                  ref={menuRef}
                  className="absolute bottom-full left-0 z-30 mb-1.5 min-w-[9rem] rounded-lg border border-zinc-700 bg-zinc-950 py-1 shadow-xl"
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
            className="flex h-9 shrink-0 items-center"
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
              className="h-9 w-32 rounded-lg border border-zinc-600 bg-zinc-900 px-3 text-sm text-white outline-none focus:border-emerald-500"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-sm text-zinc-500 transition hover:bg-zinc-900 hover:text-emerald-400"
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
