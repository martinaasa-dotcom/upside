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

const MODES = [
  {
    id: OVERVIEW_TAB_ID,
    label: "Overview",
    Icon: LayoutDashboard,
  },
  {
    id: COMPOUND_TAB_ID,
    label: "Compound",
    Icon: Calculator,
  },
  {
    id: LAB_TAB_ID,
    label: "Lab",
    Icon: FlaskConical,
  },
] as const;

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
  const sheetActive = portfolios.some((p) => p.id === activeId);

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
    <nav className="sticky bottom-0 z-20 border-t border-zinc-800/80 bg-[#121214]/95 pb-[max(0.35rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-end sm:gap-4">
        {/* App modes — one segmented control, equal cells (Lab isn't tiny) */}
        <div className="shrink-0">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
            Workspace
          </p>
          <div
            role="tablist"
            aria-label="Workspace"
            className="grid h-10 w-full grid-cols-3 overflow-hidden rounded-lg bg-brand/10 ring-1 ring-inset ring-brand/35 sm:w-[21rem]"
          >
            {MODES.map(({ id, label, Icon }) => {
              const active = activeId === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setMenu(null);
                    onChange(id);
                  }}
                  className={cn(
                    "inline-flex min-w-0 items-center justify-center gap-1.5 px-2 text-[12px] font-medium transition sm:text-[13px]",
                    active
                      ? "bg-brand text-[#121214] shadow-sm"
                      : "text-brand-bright/80 hover:bg-brand/15 hover:text-brand-bright"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sheets — different language: text rail, not twin chips */}
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
            Sheets
          </p>
          <div
            role="tablist"
            aria-label="Portfolio sheets"
            className={cn(
              "flex h-10 items-stretch gap-0.5 overflow-x-auto border-b border-zinc-800/90",
              sheetActive ? "border-zinc-700" : "border-zinc-800/60"
            )}
          >
            {portfolios.map((p) => {
              const active = p.id === activeId;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={`${p.name} · right-click to rename or delete`}
                  onClick={() => {
                    setMenu(null);
                    onChange(p.id);
                  }}
                  onContextMenu={(e) => openContextMenu(e, p.id, p.name)}
                  onDoubleClick={() => onRenameRequest?.(p.id, p.name)}
                  className={cn(
                    "relative shrink-0 px-3 text-[13px] transition",
                    active
                      ? "font-semibold text-white"
                      : "text-zinc-500 hover:text-zinc-200"
                  )}
                >
                  <span className="flex h-full items-center">{p.name}</span>
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand"
                    />
                  )}
                </button>
              );
            })}

            {adding ? (
              <form
                className="flex h-full shrink-0 items-center px-1"
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
                  className="h-7 w-28 rounded border border-zinc-600 bg-zinc-900 px-2 text-[13px] text-white outline-none focus:border-brand"
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex shrink-0 items-center gap-1 px-2.5 text-[12px] text-zinc-500 hover:text-zinc-300"
                aria-label="Add sheet"
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </button>
            )}
          </div>
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
