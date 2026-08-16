"use client";

import { useAuth } from "@/components/AuthProvider";
import { useFeedback } from "@/components/FeedbackHost";
import {
  UpsideLogo,
  UPSIDE_HEADER_WORDMARK_CLASS,
} from "@/components/UpsideLogo";
import { cn } from "@/lib/format";
import Link from "next/link";
import { Bell, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  /** Gold A + UPSIDE LAB, same lockup as the desktop bar. */
  brand?: boolean;
  avatar?: { url?: string | null; initial?: string };
  alertCount?: number;
  onAlerts?: () => void;
  alertsHref?: string;
  /** Replaces the bell (community settings, fund refresh, …). */
  end?: ReactNode;
  className?: string;
};

const ICON_BTN =
  "inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground/80 hover:bg-hover hover:text-foreground";

function FeedbackIconButton() {
  const { user } = useAuth();
  const { openManual } = useFeedback();
  if (!user) return null;
  return (
    <button
      type="button"
      onClick={openManual}
      aria-label="Feedback"
      className={ICON_BTN}
    >
      <MessageSquare className="h-5 w-5" />
    </button>
  );
}

export function MobileTopBar({
  title,
  brand = false,
  avatar,
  alertCount = 0,
  onAlerts,
  alertsHref = "/?tab=alerts",
  end,
  className,
}: Props) {
  const bell = (
    <span className={cn(ICON_BTN, "relative")}>
      <Bell className="h-5 w-5" />
      {alertCount > 0 && (
        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-mustard" />
      )}
    </span>
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-border bg-app/95 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden",
        className
      )}
    >
      <div className="grid h-12 grid-cols-[5rem_1fr_5rem] items-center px-4">
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
              className="h-8 w-8 rounded-md border border-border object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-xs font-semibold text-foreground/80">
              {avatar?.initial ?? "?"}
            </span>
          )}
        </Link>
        {brand ? (
          <div className="flex min-w-0 items-center justify-center">
            <h1 className="sr-only">{title}</h1>
            <UpsideLogo
              variant="wordmark"
              alwaysType
              className={UPSIDE_HEADER_WORDMARK_CLASS}
            />
          </div>
        ) : (
          <h1 className="truncate text-center font-heading text-base font-bold text-foreground">
            {title}
          </h1>
        )}
        <div className="flex items-center justify-end">
          <FeedbackIconButton />
          {end ? (
            end
          ) : onAlerts ? (
            <button
              type="button"
              onClick={onAlerts}
              aria-label={
                alertCount > 0 ? `Alerts, ${alertCount} waiting` : "Alerts"
              }
            >
              {bell}
            </button>
          ) : (
            <Link
              href={alertsHref}
              aria-label={
                alertCount > 0 ? `Alerts, ${alertCount} waiting` : "Alerts"
              }
            >
              {bell}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
