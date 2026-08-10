"use client";

import { cn } from "@/lib/format";
import { OVERVIEW_TAB_ID } from "@/lib/overview";
import type { Portfolio } from "@/lib/types";
import { LayoutDashboard, MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  portfolios: Portfolio[];
  activeId: string;
  onChange: (id: string) => void;
  onAdd: (name: string) => void;
  onRenameRequest?: (id: string, name: string) => void;
  onDeleteRequest?: (id: string, name: string) => void;
};

type OpenMenu = {
  id: string;
  name: string;
  left: number;
  bottom: number;
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
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [mounted, setMounted] = useState(false);
  const overviewActive = activeId === OVERVIEW_TAB_ID;

  useEffect(() => {
    setMounted(true);
  }, []);

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
    if (!menu) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-sheet-menu]") || target?.closest("[data-sheet-menu-trigger]")) {
        return;
      }
      setMenu(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(null);
    }
    function onScroll() {
      setMenu(null);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    // Close when the tab strip scrolls horizontally
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [menu]);

  function openMenu(
    e: React.MouseEvent<HTMLButtonElement>,
    id: string,
    sheetName: string
  ) {
    e.preventDefault();
    e.stopPropagation();
    if (menu?.id === id) {
      setMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({
      id,
      name: sheetName,
      left: Math.min(rect.left, window.innerWidth - 160),
      bottom: window.innerHeight - rect.top + 6,
    });
  }

  return (
    <nav className="sticky bottom-0 z-20 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-1.5 overflow-x-auto px-3 py-2">
        <button
          type="button"
          onClick={() => {
            setMenu(null);
            onChange(OVERVIEW_TAB_ID);
          }}
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
          const menuOpen = menu?.id === p.id;
          return (
            <div
              key={p.id}
              className={cn(
                "relative flex h-9 shrink-0 items-stretch rounded-lg transition",
                active
                  ? "bg-zinc-800 text-white ring-1 ring-inset ring-zinc-600"
                  : "text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200"
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setMenu(null);
                  onChange(p.id);
                }}
                onDoubleClick={() => onRenameRequest?.(p.id, p.name)}
                className={cn(
                  "rounded-l-lg px-3 text-sm transition",
                  active && "font-semibold"
                )}
              >
                {p.name}
              </button>
              <button
                type="button"
                data-sheet-menu-trigger
                onClick={(e) => openMenu(e, p.id, p.name)}
                className={cn(
                  "flex items-center rounded-r-lg border-l px-2 transition",
                  active
                    ? "border-zinc-600/80 text-zinc-300 hover:bg-zinc-700/60 hover:text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-200",
                  menuOpen && "bg-zinc-700/50 text-white"
                )}
                aria-label={`Options for ${p.name}`}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
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

      {mounted &&
        menu &&
        createPortal(
          <div
            data-sheet-menu
            role="menu"
            className="fixed z-[100] min-w-[9rem] rounded-lg border border-zinc-700 bg-zinc-950 py-1 shadow-xl"
            style={{ left: menu.left, bottom: menu.bottom }}
          >
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900"
              onClick={() => {
                const id = menu.id;
                const sheetName = menu.name;
                setMenu(null);
                onRenameRequest?.(id, sheetName);
              }}
            >
              Rename
            </button>
            {onDeleteRequest && portfolios.length > 1 && (
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-rose-300 hover:bg-zinc-900"
                onClick={() => {
                  const id = menu.id;
                  const sheetName = menu.name;
                  setMenu(null);
                  onDeleteRequest(id, sheetName);
                }}
              >
                Delete
              </button>
            )}
          </div>,
          document.body
        )}
    </nav>
  );
}
