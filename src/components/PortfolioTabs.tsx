"use client";

import { cn } from "@/lib/format";
import { OVERVIEW_TAB_ID } from "@/lib/overview";
import type { Portfolio } from "@/lib/types";
import { LayoutDashboard, Plus } from "lucide-react";
import { useState } from "react";

type Props = {
  portfolios: Portfolio[];
  activeId: string;
  onChange: (id: string) => void;
  onAdd: (name: string) => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
};

export function PortfolioTabs({
  portfolios,
  activeId,
  onChange,
  onAdd,
  onRename,
  onDelete,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
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
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.id)}
              onDoubleClick={() => {
                if (!onRename) return;
                const next = prompt("Rename sheet", p.name);
                if (next?.trim()) onRename(p.id, next.trim());
              }}
              onContextMenu={(e) => {
                if (!onDelete || portfolios.length <= 1) return;
                e.preventDefault();
                if (confirm(`Delete sheet “${p.name}”?`)) onDelete(p.id);
              }}
              className={cn(
                "shrink-0 px-4 py-2 text-sm transition",
                active
                  ? "rounded-lg border border-zinc-600 bg-zinc-800 font-semibold text-white shadow-sm"
                  : "rounded-lg border border-transparent text-zinc-400 hover:bg-zinc-900/70 hover:text-zinc-200"
              )}
              title="Double-click to rename · right-click to delete"
            >
              {p.name}
            </button>
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
