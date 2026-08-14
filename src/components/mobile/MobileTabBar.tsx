"use client";

import { cn } from "@/lib/format";
import { Bell, Compass, Home, Settings } from "lucide-react";
import Link from "next/link";

export type MobileTabId = "home" | "explore" | "alerts" | "settings";

const TABS: {
  id: MobileTabId;
  href: string;
  label: string;
  Icon: typeof Home;
}[] = [
  { id: "home", href: "/", label: "Home", Icon: Home },
  { id: "explore", href: "/?tab=pulse", label: "Explore", Icon: Compass },
  { id: "alerts", href: "/?tab=alerts", label: "Alerts", Icon: Bell },
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
    return "explore";
  }
  const tab = (tabParam ?? "").toLowerCase();
  if (tab === "alerts") return "alerts";
  if (tab === "pulse" || tab === "lab" || tab === "compound") return "explore";
  return "home";
}

export function MobileTabBar({
  active,
  alertCount = 0,
  className,
  exploreHref,
  onSelect,
}: {
  active: MobileTabId;
  alertCount?: number;
  className?: string;
  exploreHref?: string;
  /** Return true to stay on this page (Dashboard SPA tabs). */
  onSelect?: (id: MobileTabId) => boolean | void;
}) {
  return (
    <nav
      aria-label="App"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden",
        className
      )}
    >
      <div className="grid h-14 grid-cols-4">
        {TABS.map(({ id, href, label, Icon }) => {
          const on = active === id;
          const to = id === "explore" && exploreHref ? exploreHref : href;
          return (
            <Link
              key={id}
              href={to}
              aria-label={label}
              aria-current={on ? "page" : undefined}
              onClick={(e) => {
                if (!onSelect) return;
                if (onSelect(id)) e.preventDefault();
              }}
              className={cn(
                "relative flex flex-col items-center justify-center text-zinc-500",
                on && "text-brand"
              )}
            >
              {on && (
                <span
                  aria-hidden
                  className="absolute top-0 h-0.5 w-8 rounded-full bg-brand"
                />
              )}
              <span className="relative">
                <Icon className="h-5 w-5" strokeWidth={on ? 2.2 : 1.75} />
                {id === "alerts" && alertCount > 0 && (
                  <span className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-orange-400" />
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
