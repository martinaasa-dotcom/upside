"use client";

import { useAuth } from "@/components/AuthProvider";
import { useFeedback } from "@/components/FeedbackHost";
import { HeaderBrand } from "@/components/HeaderBrand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import Link from "next/link";
import { Bell, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  /** Kept so older call sites still compile. The lockup always shows. */
  brand?: boolean;
  avatar?: { url?: string | null; initial?: string };
  alertCount?: number;
  onAlerts?: () => void;
  alertsHref?: string;
  /** Page actions, left of Feedback. Same slot as AppHeader children. */
  end?: ReactNode;
  /** Status row, same as desktop. Stays stuck with the bar. */
  children?: ReactNode;
  className?: string;
};

function FeedbackIconButton() {
  const { user } = useAuth();
  const { openManual } = useFeedback();
  if (!user) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={openManual}
      aria-label="Feedback"
    >
      <MessageSquare />
    </Button>
  );
}

function hasVisibleTitle(title: ReactNode) {
  if (title == null || title === false) return false;
  if (typeof title === "string") return title.trim().length > 0;
  return true;
}

export function MobileTopBar({
  title,
  avatar,
  alertCount = 0,
  onAlerts,
  alertsHref = "/?tab=alerts",
  end,
  children,
  className,
}: Props) {
  const bell = (
    <span className="relative">
      <Bell />
      {alertCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
      )}
    </span>
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-40 bg-background/75 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:hidden",
        className
      )}
    >
      <div className="flex h-14 items-center justify-between gap-2 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <HeaderBrand alwaysType />
          {hasVisibleTitle(title) ? (
            <>
              <span className="h-3.5 w-px shrink-0 bg-border" aria-hidden />
              {typeof title === "string" ? (
                <h1 className="min-w-0 truncate text-sm font-medium leading-none text-muted-foreground">
                  {title}
                </h1>
              ) : (
                <div className="min-w-0">{title}</div>
              )}
            </>
          ) : (
            <h1 className="sr-only">Upside Lab</h1>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1">
          {end}
          <FeedbackIconButton />
          {onAlerts ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onAlerts}
              aria-label={
                alertCount > 0 ? `Alerts, ${alertCount} waiting` : "Alerts"
              }
            >
              {bell}
            </Button>
          ) : alertsHref && !avatar ? (
            <Button asChild variant="ghost" size="icon-sm">
              <Link
                href={alertsHref}
                aria-label={
                  alertCount > 0 ? `Alerts, ${alertCount} waiting` : "Alerts"
                }
              >
                {bell}
              </Link>
            </Button>
          ) : null}
          {avatar ? (
            <Link
              href="/account"
              aria-label="Account"
              title="Account"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-card"
            >
              {avatar.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar.url}
                  alt=""
                  width={32}
                  height={32}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-sm font-semibold text-muted-foreground">
                  {avatar.initial ?? "?"}
                </span>
              )}
            </Link>
          ) : null}
        </div>
      </div>
      {children}
    </header>
  );
}
