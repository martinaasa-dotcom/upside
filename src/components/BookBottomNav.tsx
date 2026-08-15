"use client";

import { cn } from "@/lib/format";
import { PAGE_COLUMN_CLASS } from "@/lib/page-shell";
import { Activity, Calculator, FlaskConical, LayoutDashboard } from "lucide-react";
import Link from "next/link";

/**
 * Desktop dock on pages outside the book (Communities, Fund, Account, Admin).
 * Same four destinations as "In your book", as real links, so you can leave
 * a community without hunting for Book in the header. Hidden on phones,
 * where MobileTabBar already covers Home / Pulse / Circle / Account.
 */
const ITEMS = [
  {
    href: "/",
    label: "Overview",
    title: "Today's briefing and your sheets",
    Icon: LayoutDashboard,
  },
  {
    href: "/?tab=pulse",
    label: "Pulse",
    title: "Pulse for names you hold",
    Icon: Activity,
  },
  {
    href: "/?tab=lab",
    label: "Lab",
    title: "Allocation, risk, trends, seasonality",
    Icon: FlaskConical,
  },
  {
    href: "/?tab=compound",
    label: "Compound",
    title: "What this book could become if you keep going",
    Icon: Calculator,
  },
] as const;

export function BookBottomNav({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Back to your book"
      className={cn(
        "sticky bottom-0 z-30 hidden border-t border-border bg-app/95 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur md:block",
        className
      )}
    >
      <div className={cn(PAGE_COLUMN_CLASS, "py-2")}>
        <p className="mb-1 text-xs font-medium text-muted">
          In your book
        </p>
        <div className="grid h-12 w-full max-w-[36rem] grid-cols-4 overflow-hidden rounded-lg bg-well/80 ring-1 ring-inset ring-brand/30">
          {ITEMS.map(({ href, label, title, Icon }) => (
            <Link
              key={href}
              href={href}
              title={title}
              className="flex h-full w-full min-h-0 min-w-0 items-center justify-center gap-1.5 px-2 text-sm font-medium text-muted transition hover:text-brand-bright"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              <span className="whitespace-nowrap">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
