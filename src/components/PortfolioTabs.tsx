"use client";

import { cn } from "@/lib/format";
import { COMPOUND_TAB_ID, LAB_TAB_ID, OVERVIEW_TAB_ID } from "@/lib/overview";
import type { Portfolio } from "@/lib/types";
import { Calculator, FlaskConical, LayoutDashboard, Plus } from "lucide-react";
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
  x: number;
  y: number;
};

/** Fixed chip width so sheets read as equal columns. */
const SHEET_TAB_WIDTH = "w-[7.25rem]";

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
  const compoundActive = activeId === COMPOUND_TAB_ID;
  const labActive = activeId === LAB_TAB_ID;

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
      if (target?.closest("[data-sheet-menu]")) return;
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
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [menu]);

  function openContextMenu(
    e: React.MouseEvent,
    id: string,
    sheetName: string
  ) {
    e.preventDefault();
    e.stopPropagation();
    const menuW = 144;
    const menuH = 88;
    setMenu({
      id,
      name: sheetName,
      x: Math.min(e.clientX, window.innerWidth - menuW - 8),
      y: Math.min(e.clientY, window.innerHeight - menuH - 8),
    });
  }

  return (
    <nav className="sticky bottom-0 z-20 border-t border-brand-deep/30 bg-[#121214]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-1 overflow-x-auto px-3 py-2">
        <button
          type="button"
          onClick={() => {
            setMenu(null);
            onChange(OVERVIEW_TAB_ID);
          }}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm transition",
            overviewActive
              ? "bg-brand/15 font-semibold text-brand-bright ring-1 ring-inset ring-brand/40"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          )}
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          Overview
        </button>

        <button
          type="button"
          onClick={() => {
            setMenu(null);
            onChange(COMPOUND_TAB_ID);
          }}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm transition",
            compoundActive
              ? "bg-brand/15 font-semibold text-brand-bright ring-1 ring-inset ring-brand/40"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          )}
        >
          <Calculator className="h-3.5 w-3.5" />
          Compound
        </button>

        <button
          type="button"
          onClick={() => {
            setMenu(null);
            onChange(LAB_TAB_ID);
          }}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm transition",
            labActive
              ? "bg-brand/15 font-semibold text-brand-bright ring-1 ring-inset ring-brand/40"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          )}
        >
          <FlaskConical className="h-3.5 w-3.5" />
          Lab
        </button>

        <div className="mx-1 h-5 w-px shrink-0 bg-zinc-700" aria-hidden />

        <div className="flex shrink-0 items-center divide-x divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800">
          {portfolios.map((p) => {
            const active = p.id === activeId;
            return (
              <button
                key={p.id}
                type="button"
                title={`${p.name} · right-click for options`}
                onClick={() => {
                  setMenu(null);
                  onChange(p.id);
                }}
                onContextMenu={(e) => openContextMenu(e, p.id, p.name)}
                onDoubleClick={() => onRenameRequest?.(p.id, p.name)}
                className={cn(
                  SHEET_TAB_WIDTH,
                  "h-9 shrink-0 truncate px-2.5 text-center text-sm transition",
                  active
                    ? "bg-zinc-800 font-semibold text-white"
                    : "bg-transparent text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200"
                )}
              >
                {p.name}
              </button>
            );
          })}
        </div>

        {adding ? (
          <form
            className="ml-1 flex h-9 shrink-0 items-center"
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
              className="h-9 w-[7.25rem] rounded-lg border border-zinc-600 bg-zinc-900 px-3 text-sm text-white outline-none focus:border-brand"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ml-1 inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-sm text-zinc-500 transition hover:bg-zinc-900 hover:text-brand"
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
            style={{ left: menu.x, top: menu.y }}
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
