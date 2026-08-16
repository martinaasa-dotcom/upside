"use client";

import { stashOpenTab } from "@/lib/active-sheet";
import { cn } from "@/lib/format";
import { useDockPad } from "@/lib/use-dock-pad";
import { Compass, Home, Activity, Settings } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

export type MobileTabId = "home" | "pulse" | "circle" | "settings";

const TABS: {
  id: MobileTabId;
  href: string;
  label: string;
  Icon: typeof Home;
}[] = [
  { id: "home", href: "/", label: "Home", Icon: Home },
  { id: "pulse", href: "/?tab=pulse", label: "Pulse", Icon: Activity },
  { id: "circle", href: "/communities", label: "Circle", Icon: Compass },
  { id: "settings", href: "/account", label: "Account", Icon: Settings },
];

export function activeMobileTab(
  pathname: string,
  tabParam?: string | null
): MobileTabId {
  if (pathname.startsWith("/account") || pathname.startsWith("/admin")) {
    return "settings";
  }
  if (
    pathname.startsWith("/upside-portfolio") ||
    pathname.startsWith("/communities")
  ) {
    return "circle";
  }
  const tab = (tabParam ?? "").toLowerCase();
  if (tab === "pulse") return "pulse";
  if (tab === "lab" || tab === "compound") return "home";
  return "home";
}

export function MobileTabBar({
  active,
  alertCount = 0,
  className,
  pulseHref,
  onSelect,
}: {
  active: MobileTabId;
  alertCount?: number;
  className?: string;
  pulseHref?: string;
  /** Return true to stay on this page (Dashboard SPA tabs). */
  onSelect?: (id: MobileTabId) => boolean | void;
}) {
  const dockRef = useRef<HTMLElement>(null);
  useDockPad(dockRef);
  return (
    <nav
      ref={dockRef}
      aria-label="App"
      className={cn(
        "keyboard-chrome fixed inset-x-0 bottom-0 z-40 border-t border-border bg-app/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden",
        className
      )}
    >
      <div className="grid h-16 grid-cols-4">
        {TABS.map(({ id, href, label, Icon }) => {
          const on = active === id;
          const to = id === "pulse" && pulseHref ? pulseHref : href;
          return (
            <Link
              key={id}
              href={to}
              aria-label={label}
              aria-current={on ? "page" : undefined}
              onClick={(e) => {
                if (id === "home") stashOpenTab("overview");
                if (id === "pulse") stashOpenTab("pulse");
                if (!onSelect) return;
                if (onSelect(id)) e.preventDefault();
              }}
              className={cn(
                "touch-target relative flex flex-col items-center justify-center gap-0.5 text-muted",
                on && "text-foreground"
              )}
            >
              {on && (
                <span
                  aria-hidden
                  className="absolute top-0 h-0.5 w-8 rounded-full bg-select"
                />
              )}
              <span className="relative">
                <Icon className="h-5 w-5" strokeWidth={on ? 2.2 : 1.75} />
                {id === "home" && alertCount > 0 && (
                  <span className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-mustard" />
                )}
              </span>
              <span className="text-sm leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
