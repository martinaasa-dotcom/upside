"use client";

import { Calculator, FlaskConical, LayoutDashboard, Plus, Activity, Users, BarChart3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/format";
import {
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
  SEASONALITY_TAB_ID,
} from "@/lib/overview";
import type { Portfolio } from "@/lib/types";

type Props = {
  portfolios: Portfolio[];
  activeId: string;
  onChange: (id: string) => void;
  onAdd: (name: string) => void;
  onRenameRequest?: (id: string, name: string) => void;
  onDeleteRequest?: (id: string, name: string) => void;
  /** Guests: Overview + Compound only — no Lab / sheet mutations. */
  guest?: boolean;
  /** Meta-tab ids to hide, driven by the viewer's experience tier. */
  hiddenModeIds?: string[];
  /** Opens Communities workspace (signed-in). */
  onOpenCommunities?: () => void;
  /** Compact book/sheet totals shown above tabs on phone. */
  mobileSummary?: {
    title: string;
    totalValue: string;
    todayValue: string;
    todayPct: string | null;
    todayPositive: boolean;
  };
  /** Today's $ direction per portfolio id — glanceable dot per sheet tab. */
  sheetTodayTone?: Record<string, "up" | "down" | null>;
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
    shortLabel: "Home",
    Icon: LayoutDashboard,
  },
  {
    id: COMPOUND_TAB_ID,
    label: "Compound",
    shortLabel: "Growth",
    Icon: Calculator,
  },
  {
    id: PULSE_TAB_ID,
    label: "Pulse",
    shortLabel: "Pulse",
    Icon: Activity,
  },
  {
    id: SEASONALITY_TAB_ID,
    label: "Seasonality",
    shortLabel: "Season",
    Icon: BarChart3,
  },
  {
    id: LAB_TAB_ID,
    label: "Lab",
    shortLabel: "Lab",
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
  guest = false,
  hiddenModeIds = [],
  onOpenCommunities,
  mobileSummary,
  sheetTodayTone,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [mounted, setMounted] = useState(false);
  const longPressRef = useRef<number | null>(null);
  const sheetActive = portfolios.some((p) => p.id === activeId);
  const modes = MODES.filter((m) => {
    if (guest && m.id === LAB_TAB_ID) return false;
    if (hiddenModeIds.includes(m.id)) return false;
    return true;
  });
  const modeCols = modes.length;

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

  function openContextMenuAt(
    x: number,
    y: number,
    id: string,
    sheetName: string
  ) {
    const menuW = 144;
    const menuH = 88;
    setMenu({
      id,
      name: sheetName,
      x: Math.min(x, window.innerWidth - menuW - 8),
      y: Math.min(y, window.innerHeight - menuH - 8),
    });
  }

  function startSheetLongPress(
    e: React.TouchEvent,
    id: string,
    sheetName: string
  ) {
    if (guest) return;
    const touch = e.touches[0];
    if (!touch) return;
    longPressRef.current = window.setTimeout(() => {
      openContextMenuAt(touch.clientX, touch.clientY, id, sheetName);
    }, 480);
  }

  function cancelSheetLongPress() {
    if (longPressRef.current != null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }

  return (
    <nav className="sticky bottom-0 z-30 border-t border-zinc-800/80 bg-[#121214]/95 pb-[max(0.35rem,env(safe-area-inset-bottom))] backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-3 py-2 sm:flex-row sm:items-end sm:gap-4 sm:px-4 sm:py-2.5">
        {mobileSummary && (
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800/70 pb-2 md:hidden">
            <div className="min-w-0">
              <p className="truncate text-[10px] uppercase tracking-wide text-zinc-500">
                {mobileSummary.title}
              </p>
              <p className="truncate text-sm font-semibold tabular-nums text-white">
                {mobileSummary.totalValue}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                Today
              </p>
              <p
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  mobileSummary.todayPositive ? "text-gain" : "text-loss"
                )}
              >
                {mobileSummary.todayValue}
                {mobileSummary.todayPct ? (
                  <span className="ml-1 text-[11px] font-normal opacity-80">
                    {mobileSummary.todayPct}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
        )}

        {/* App modes — one segmented control, equal cells (Lab isn't tiny) */}
        <div className="flex shrink-0 items-end gap-2 md:min-w-0">
          <div className="min-w-0 flex-1 sm:flex-none">
            <p className="mb-1 hidden text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500 sm:block">
              Workspace
            </p>
            <div
              role="tablist"
              aria-label="Workspace"
              className={cn(
                "grid h-11 w-full overflow-hidden rounded-lg bg-brand/10 ring-1 ring-inset ring-brand/35",
                modeCols === 2 && "grid-cols-2 sm:w-[14rem]",
                modeCols === 3 && "grid-cols-3 sm:w-[21rem]",
                modeCols === 4 && "grid-cols-4 sm:w-[28rem]",
                modeCols >= 5 && "grid-cols-5 sm:w-[35rem]"
              )}
            >
              {modes.map(({ id, label, shortLabel, Icon }) => {
                const active = activeId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    title={label}
                    onClick={() => {
                      setMenu(null);
                      onChange(id);
                    }}
                    className={cn(
                      "touch-target flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 font-medium transition sm:flex-row sm:gap-1.5 sm:px-2",
                      active
                        ? "bg-brand text-[#121214] shadow-sm"
                        : "text-brand-bright/80 hover:bg-brand/15 hover:text-brand-bright"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                    <span className="max-w-full truncate text-[9px] leading-none sm:hidden">
                      {shortLabel}
                    </span>
                    <span className="hidden truncate text-[13px] sm:inline">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {onOpenCommunities && (
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                onOpenCommunities();
              }}
              className="touch-target inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-brand-mid/45 bg-brand/15 px-2.5 text-[11px] font-semibold text-brand-bright transition hover:bg-brand/25 sm:px-3 sm:text-[13px]"
              aria-label="Communities"
            >
              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Communities</span>
            </button>
          )}
        </div>

        {/* Sheets — different language: text rail, not twin chips */}
        <div className="min-w-0 flex-1">
          <p className="mb-1 hidden text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500 sm:block">
            Sheets
          </p>
          <div
            role="tablist"
            aria-label="Portfolio sheets"
            className={cn(
              "scrollbar-none flex h-11 items-stretch gap-0.5 overflow-x-auto border-b border-zinc-800/90 snap-x snap-mandatory",
              sheetActive ? "border-zinc-700" : "border-zinc-800/60"
            )}
          >
            {portfolios.map((p) => {
              const active = p.id === activeId;
              const tone = sheetTodayTone?.[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={`${p.name} · long-press to rename or delete`}
                  onClick={() => {
                    setMenu(null);
                    onChange(p.id);
                  }}
                  onContextMenu={(e) => openContextMenu(e, p.id, p.name)}
                  onDoubleClick={() => onRenameRequest?.(p.id, p.name)}
                  onTouchStart={(e) => startSheetLongPress(e, p.id, p.name)}
                  onTouchEnd={cancelSheetLongPress}
                  onTouchMove={cancelSheetLongPress}
                  onTouchCancel={cancelSheetLongPress}
                  className={cn(
                    "touch-target relative shrink-0 snap-start px-3 text-[13px] transition",
                    active
                      ? "font-semibold text-white"
                      : "text-zinc-500 hover:text-zinc-200"
                  )}
                >
                  <span className="flex h-full items-center gap-1.5 whitespace-nowrap">
                    {tone && (
                      <span
                        aria-hidden
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          tone === "up" ? "bg-gain" : "bg-loss"
                        )}
                        title={
                          tone === "up" ? "Up today" : "Down today"
                        }
                      />
                    )}
                    {p.name}
                  </span>
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
            ) : !guest ? (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex shrink-0 items-center gap-1 px-2.5 text-[12px] text-zinc-500 hover:text-zinc-300"
                aria-label="Add sheet"
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {mounted &&
        menu &&
        !guest &&
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
