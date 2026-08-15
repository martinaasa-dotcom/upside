"use client";

import { cn } from "@/lib/format";
import Link from "next/link";
import { Bell } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  avatar?: { url?: string | null; initial?: string };
  alertCount?: number;
  onAlerts?: () => void;
  alertsHref?: string;
  /** Replaces the bell (community settings, fund refresh, …). */
  end?: ReactNode;
  className?: string;
};

export function MobileTopBar({
  title,
  avatar,
  alertCount = 0,
  onAlerts,
  alertsHref = "/?tab=alerts",
  end,
  className,
}: Props) {
  const bell = (
    <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-300">
      <Bell className="h-5 w-5" />
      {alertCount > 0 && (
        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-orange-400" />
      )}
    </span>
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-40 bg-app/95 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden",
        className
      )}
    >
      <div className="grid h-12 grid-cols-[2.5rem_1fr_2.5rem] items-center px-4">
        <Link
          href="/account"
          aria-label="Account"
          className="flex h-10 w-10 items-center justify-center"
        >
          {avatar?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar.url}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand-bright">
              {avatar?.initial ?? "?"}
            </span>
          )}
        </Link>
        <h1 className="truncate text-center font-heading text-base font-bold text-white">
          {title}
        </h1>
        {end ? (
          <div className="justify-self-end">{end}</div>
        ) : onAlerts ? (
          <button
            type="button"
            onClick={onAlerts}
            aria-label={
              alertCount > 0 ? `Alerts, ${alertCount} waiting` : "Alerts"
            }
            className="justify-self-end"
          >
            {bell}
          </button>
        ) : (
          <Link
            href={alertsHref}
            aria-label={
              alertCount > 0 ? `Alerts, ${alertCount} waiting` : "Alerts"
            }
            className="justify-self-end"
          >
            {bell}
          </Link>
        )}
      </div>
    </header>
  );
}
