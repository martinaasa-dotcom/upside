"use client";

import { CircleDockLink } from "@/components/CircleDockLink";
import { Activity, Calculator, FlaskConical, LayoutDashboard, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/format";
import { PAGE_COLUMN_CLASS } from "@/lib/page-shell";
import { useDockPad } from "@/lib/use-dock-pad";
import {
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
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
  /** Today's $ direction per portfolio id — glanceable dot per sheet tab. */
  sheetTodayTone?: Record<string, "up" | "down" | null>;
  className?: string;
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
    id: PULSE_TAB_ID,
    label: "Pulse",
    shortLabel: "Pulse",
    Icon: Activity,
  },
  {
    id: LAB_TAB_ID,
    label: "Lab",
    shortLabel: "Lab",
    Icon: FlaskConical,
  },
  {
    id: COMPOUND_TAB_ID,
    label: "Compound",
    shortLabel: "Growth",
    Icon: Calculator,
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
  sheetTodayTone,
  className,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [mounted, setMounted] = useState(false);
  const dockRef = useRef<HTMLElement>(null);
  const longPressRef = useRef<number | null>(null);
  useDockPad(dockRef);
  const sheetRefs = useRef<Record<string, HTMLButtonElement | null>>({});
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

  // The sheet rail scrolls once you have more than a few sheets, so keep
  // the active one visible. Switching sheets from the command palette or a
  // shared ?sheet= link otherwise left the highlight off-screen.
  useEffect(() => {
    sheetRefs.current[activeId]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeId]);

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
    <nav
      ref={dockRef}
      className={cn(
        "keyboard-chrome fixed inset-x-0 bottom-0 z-30 border-t border-border bg-app/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur",
        className
      )}
    >
      <div className={cn(PAGE_COLUMN_CLASS, "flex flex-col-reverse gap-2 py-2 sm:flex-row sm:items-end sm:gap-5 sm:py-2.5")}>
        {/* App modes — sits at the thumb edge on phones */}
        <div className="flex w-full shrink-0 items-end sm:w-auto">
          <div className="min-w-0 flex-1 sm:flex-none">
            <p className="mb-1.5 hidden text-sm font-medium text-muted sm:block">
              In your portfolio
            </p>
            <div
              role="tablist"
              aria-label="In your portfolio"
              className={cn(
                "grid h-12 w-full overflow-hidden rounded-lg bg-well/80 ring-1 ring-inset ring-brand/30 sm:h-12",
                modeCols === 2 && "grid-cols-2 sm:w-[18rem]",
                modeCols === 3 && "grid-cols-3 sm:w-[28rem]",
                modeCols === 4 && "grid-cols-4 sm:w-[36rem]",
                modeCols >= 5 && "grid-cols-5 sm:w-[44rem]"
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
                      "flex h-full w-full min-h-0 min-w-0 flex-col items-center justify-center gap-0.5 px-1.5 font-medium transition",
                      "sm:flex-row sm:gap-1.5 sm:px-2",
                      active
                        ? "bg-select text-select-ink"
                        : "text-muted hover:text-brand-bright"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-90 sm:h-3.5 sm:w-3.5" aria-hidden />
                    <span className="max-w-full text-sm leading-none sm:hidden">
                      {shortLabel}
                    </span>
                    <span className="hidden whitespace-nowrap text-sm sm:inline">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="hidden shrink-0 sm:block">
          <p className="mb-1.5 text-sm font-medium text-muted">Circle</p>
          <CircleDockLink />
        </div>

        {/* Sheets — different language: text rail, not twin chips */}
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 hidden text-sm font-medium text-muted sm:block">
            Sheets
          </p>
          <div
            role="tablist"
            aria-label="Your portfolios"
            className={cn(
              "scrollbar-none flex h-10 items-stretch gap-0.5 overflow-x-auto border-b border-border/90 snap-x snap-mandatory sm:h-11",
              sheetActive ? "border-border" : "border-border"
            )}
          >
            {portfolios.map((p) => {
              const active = p.id === activeId;
              const tone = sheetTodayTone?.[p.id];
              return (
                <button
                  key={p.id}
                  ref={(el) => {
                    sheetRefs.current[p.id] = el;
                  }}
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
                    "touch-target relative shrink-0 snap-start px-3 text-sm transition",
                    active
                      ? "font-semibold text-foreground"
                      : "text-muted hover:text-foreground"
                  )}
                >
                  <span className="flex h-full items-center gap-1.5 whitespace-nowrap">
                    {tone && (
                      <span
                        aria-hidden
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
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
                      className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-select"
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
                  className="h-7 w-28 rounded border border-brand-mid bg-well px-2 text-sm text-foreground outline-none focus:border-brand"
                />
              </form>
            ) : !guest ? (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="touch-target inline-flex shrink-0 items-center gap-1 px-2.5 text-sm text-muted hover:text-foreground/80"
                aria-label="Add portfolio"
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
            className="fixed z-[100] min-w-[9rem] rounded-lg border border-border bg-well py-1 shadow-xl"
            style={{ left: menu.x, top: menu.y }}
          >
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-3 text-left text-sm text-foreground hover:bg-well sm:py-2"
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
                className="block w-full px-3 py-3 text-left text-sm text-loss hover:bg-well sm:py-2"
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
