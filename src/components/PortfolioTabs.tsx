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

const metaTab =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition";
const sheetTab =
  "box-border h-8 w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-2 text-center text-[13px] transition";

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
    <nav className="sticky bottom-0 z-20 border-t border-zinc-800/80 bg-[#121214]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-2 overflow-x-auto px-4 py-2.5">
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setMenu(null);
              onChange(OVERVIEW_TAB_ID);
            }}
            className={cn(
              metaTab,
              overviewActive
                ? "bg-brand/15 font-medium text-brand-bright ring-1 ring-inset ring-brand/40"
                : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
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
              metaTab,
              compoundActive
                ? "bg-brand/15 font-medium text-brand-bright ring-1 ring-inset ring-brand/40"
                : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
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
              metaTab,
              labActive
                ? "bg-brand/15 font-medium text-brand-bright ring-1 ring-inset ring-brand/40"
                : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
            )}
          >
            <FlaskConical className="h-3.5 w-3.5" />
            Lab
          </button>
        </div>

        <div className="h-4 w-px shrink-0 bg-zinc-800" aria-hidden />

        <div className="flex shrink-0 items-center gap-1.5">
          {portfolios.map((p) => {
            const active = p.id === activeId;
            return (
              <button
                key={p.id}
                type="button"
                title={`${p.name} · right-click to rename or delete`}
                onClick={() => {
                  setMenu(null);
                  onChange(p.id);
                }}
                onContextMenu={(e) => openContextMenu(e, p.id, p.name)}
                onDoubleClick={() => onRenameRequest?.(p.id, p.name)}
                className={cn(
                  sheetTab,
                  active
                    ? "bg-zinc-800 font-medium text-white ring-1 ring-inset ring-zinc-600"
                    : "bg-zinc-950/80 text-zinc-400 ring-1 ring-inset ring-zinc-800/90 hover:bg-zinc-900 hover:text-zinc-200"
                )}
              >
                {p.name}
              </button>
            );
          })}

          {adding ? (
            <form
              className="flex h-8 shrink-0 items-center"
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
                placeholder="Name"
                className="box-border h-8 w-[6.5rem] rounded-md border border-zinc-600 bg-zinc-900 px-2 text-[13px] text-white outline-none focus:border-brand"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[13px] text-zinc-500 transition hover:bg-zinc-900 hover:text-brand-bright"
              aria-label="Add sheet"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
          )}
        </div>
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
