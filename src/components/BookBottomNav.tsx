"use client";

import { cn } from "@/lib/format";
import { Activity, Calculator, FlaskConical, LayoutDashboard } from "lucide-react";
import Link from "next/link";

/**
 * Bottom nav for pages outside My book (Communities, Fund, Account,
 * Admin).
 *
 * Those routes had no bottom bar at all, so getting from a community back
 * to Lab or Pulse meant going to My book first and finding the tab. This
 * mirrors the Dashboard's bottom row and links straight into the sheet
 * you want, using the same `?sheet=` params the Dashboard already resolves
 * on load.
 *
 * Individual sheet chips are deliberately absent: this component has no
 * portfolio list, and fetching one on every page just to render chips
 * would cost a request per navigation. Overview is one tap away and lists
 * them all.
 */
const ITEMS = [
  {
    href: "/?sheet=overview",
    label: "Home",
    title: "Today's briefing and your sheets",
    Icon: LayoutDashboard,
  },
  {
    href: "/?sheet=pulse",
    label: "Pulse",
    title: "Should you sell, hold, or add the dip?",
    Icon: Activity,
  },
  {
    href: "/?sheet=lab",
    label: "Lab",
    title: "Allocation, risk, trends, seasonality",
    Icon: FlaskConical,
  },
  {
    href: "/?sheet=compound",
    label: "Growth",
    title: "What this book could become if you keep going",
    Icon: Calculator,
  },
];

export function BookBottomNav({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Back to your book"
      className={cn(
        "sticky bottom-0 z-30 border-t border-zinc-800/80 bg-[#121214]/95 pb-[max(0.35rem,env(safe-area-inset-bottom))] backdrop-blur",
        className
      )}
    >
      <div className="mx-auto flex max-w-[1400px] items-stretch gap-1 px-3 pt-1.5 sm:px-4">
        {ITEMS.map(({ href, label, title, Icon }) => (
          <Link
            key={href}
            href={href}
            title={title}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800/60 hover:text-zinc-100"
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
