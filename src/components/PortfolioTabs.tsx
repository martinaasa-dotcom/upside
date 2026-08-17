"use client";

import { BookModeDock } from "@/components/BookModeDock";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/format";
import { PAGE_COLUMN_CLASS } from "@/lib/page-shell";
import { useDockPad } from "@/lib/use-dock-pad";
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
  /** Hide New sheet. Paper class accounts cannot open a real book. */
  hideAdd?: boolean;
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

export function PortfolioTabs({
  portfolios,
  activeId,
  onChange,
  onAdd,
  onRenameRequest,
  onDeleteRequest,
  guest = false,
  hiddenModeIds = [],
  hideAdd = false,
  sheetTodayTone,
  className,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const dockRef = useRef<HTMLElement>(null);
  const longPressRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (longPressRef.current != null) {
        window.clearTimeout(longPressRef.current);
        longPressRef.current = null;
      }
    },
    []
  );
  useDockPad(dockRef);
  const sheetRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const sheetActive = portfolios.some((p) => p.id === activeId);

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
        "keyboard-chrome fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur",
        className
      )}
    >
      <div className={cn(PAGE_COLUMN_CLASS, "flex flex-col-reverse gap-2 py-2 sm:flex-row sm:items-end sm:gap-4 sm:py-2.5")}>
        <div className="w-full shrink-0 sm:w-auto">
          <BookModeDock
            activeId={activeId}
            onSelectMode={(id) => {
              setMenu(null);
              onChange(id);
            }}
            hiddenModeIds={hiddenModeIds}
            guest={guest}
            hideCircleOnPhone
          />
        </div>

        {/* Sheets — different language: text rail, not twin chips */}
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 hidden text-sm font-medium text-muted-foreground sm:block">
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
                  title={`${p.name} - long-press to rename or delete`}
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
                    "touch-target relative shrink-0 snap-start px-3 text-sm font-medium transition",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
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
                      className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary"
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
                <Input
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
                  className="h-7 w-28"
                />
              </form>
            ) : !guest && !hideAdd ? (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="touch-target inline-flex shrink-0 items-center gap-1 px-2.5 text-sm text-muted-foreground hover:text-foreground"
                aria-label="Add portfolio"
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {menu && !guest && (
        <DropdownMenu
          open
          onOpenChange={(open) => {
            if (!open) setMenu(null);
          }}
        >
          <DropdownMenuTrigger asChild>
            <span
              aria-hidden
              className="pointer-events-none fixed size-px"
              style={{ left: menu.x, top: menu.y }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-36">
            <DropdownMenuItem
              onSelect={() => {
                const id = menu.id;
                const sheetName = menu.name;
                setMenu(null);
                onRenameRequest?.(id, sheetName);
              }}
            >
              Rename
            </DropdownMenuItem>
            {onDeleteRequest && portfolios.length > 1 ? (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  const id = menu.id;
                  const sheetName = menu.name;
                  setMenu(null);
                  onDeleteRequest(id, sheetName);
                }}
              >
                Delete
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
}
