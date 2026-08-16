"use client";

import { CircleDockLink } from "@/components/CircleDockLink";
import { cn } from "@/lib/format";
import { stashOpenTab } from "@/lib/active-sheet";
import { PAGE_COLUMN_CLASS } from "@/lib/page-shell";
import { useDockPad } from "@/lib/use-dock-pad";
import { Activity, Calculator, FlaskConical, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

/**
 * Desktop dock on pages outside the book (Communities, Fund, Account, Admin).
 * Same destinations as the book dock, as real links, so you can leave
 * a community without hunting for Book in the header. Hidden on phones,
 * where MobileTabBar already covers Home / Pulse / Circle / Account.
 */
const ITEMS = [
  {
    href: "/?tab=overview",
    tab: "overview",
    label: "Overview",
    title: "Today's briefing and your portfolios",
    Icon: LayoutDashboard,
  },
  {
    href: "/?tab=pulse",
    tab: "pulse",
    label: "Pulse",
    title: "Pulse for names you hold",
    Icon: Activity,
  },
  {
    href: "/?tab=lab",
    tab: "lab",
    label: "Lab",
    title: "Allocation, risk, trends, seasonality",
    Icon: FlaskConical,
  },
  {
    href: "/?tab=compound",
    tab: "compound",
    label: "Compound",
    title: "What your portfolio could become if you keep going",
    Icon: Calculator,
  },
] as const;

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
      <div className={cn(PAGE_COLUMN_CLASS, "flex items-end gap-5 py-2")}>
        <div className="min-w-0">
          <p className="mb-1.5 text-sm font-medium text-muted">
            In your portfolio
          </p>
          <div className="grid h-12 w-full max-w-[36rem] grid-cols-4 overflow-hidden rounded-lg bg-well/80 ring-1 ring-inset ring-brand/30">
            {ITEMS.map(({ href, tab, label, title, Icon }) => (
              <Link
                key={href}
                href={href}
                title={title}
                onClick={() => stashOpenTab(tab)}
                className="flex h-full w-full min-h-0 min-w-0 items-center justify-center gap-1.5 px-2 text-sm font-medium text-muted transition hover:text-brand-bright"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                <span className="whitespace-nowrap">{label}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="shrink-0">
          <p className="mb-1.5 text-sm font-medium text-muted">Circle</p>
          <CircleDockLink />
        </div>
      </div>
    </nav>
  );
}
