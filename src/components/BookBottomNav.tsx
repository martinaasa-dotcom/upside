"use client";

import { BookModeDock } from "@/components/BookModeDock";
import { cn } from "@/lib/format";
import { PAGE_COLUMN_CLASS } from "@/lib/page-shell";
import { useDockPad } from "@/lib/use-dock-pad";
import { useRef } from "react";

/**
 * Desktop dock on pages outside the book (Communities, Fund, Account, Admin).
 * Same destinations as the book dock, as real links, so you can leave
 * a community without hunting for Book in the header. Hidden on phones,
 * where MobileTabBar already covers Home / Pulse / Circle / Account.
 */
export function BookBottomNav({ className }: { className?: string }) {
  const dockRef = useRef<HTMLElement>(null);
  useDockPad(dockRef);
  return (
    <nav
      ref={dockRef}
      aria-label="Back to your portfolio"
      className={cn(
        "keyboard-chrome fixed inset-x-0 bottom-0 z-30 hidden border-t border-border bg-app/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur md:block",
        className
      )}
    >
      <div className={cn(PAGE_COLUMN_CLASS, "py-2.5")}>
        <BookModeDock />
      </div>
    </nav>
  );
}
