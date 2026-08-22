"use client";

import { useAuth } from "@/components/AuthProvider";
import { useFeedback } from "@/components/FeedbackHost";
import { HeaderBrand } from "@/components/HeaderBrand";
import { UpgradeNudge } from "@/components/billing/UpgradeNudge";
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
      className="touch-target"
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
        // Translucent glass, matching AppHeader on desktop. A fully opaque
        // bar here made mobile the only surface with no translucent chrome
        // at all, and clipped the page's ambient glow at a hard edge.
        "sticky top-0 z-40 bg-background/35 backdrop-blur-2xl pt-[env(safe-area-inset-top)] md:hidden",
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
                /*
                 * The size class goes on the span, never on the `<h1>`.
                 *
                 * `globals.css` styles `h1` un-layered, which beats every
                 * Tailwind utility whatever its specificity — so the
                 * `text-sm font-medium` written here lost to `1.5rem/600`
                 * and this bar set a page's name at the size of a page
                 * title. On Circle that meant the community's name
                 * ("Monki") arriving larger and louder than the wordmark
                 * next to it, and pushing the icons on the right into a
                 * shrinking column. On a child element the classes apply,
                 * and the `<h1>` keeps the heading role for a screen
                 * reader. `SheetPicker` does the same thing with its
                 * button, which is why the Dashboard's title was the one
                 * that always looked right.
                 */
                <h1 className="min-w-0">
                  <span className="block truncate text-sm font-medium leading-none text-muted-foreground">
                    {title}
                  </span>
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
          <UpgradeNudge variant="icon" />
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
              className="touch-target"
            >
              {bell}
            </Button>
          ) : alertsHref && !avatar ? (
            <Button asChild variant="ghost" size="icon-sm" className="touch-target">
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
            /*
              * The hit area grows, the box does not.
              *
              * `.touch-target` sets `min-height`/`min-width: 2.75rem`, and
              * this element is the one piece of header chrome that paints
              * a visible border — so the 44px finger target was being
              * drawn. The avatar came out as a 44px outlined square beside
              * 28px borderless glyphs, reading as a button someone had
              * emphasised rather than as the account picture. Every other
              * control in this bar is a ghost `Button`, where the same
              * inflation is invisible because there is no box on it.
              *
              * An absolute inset gives the finger the same 44px without
              * moving the pixel the eye sees — the pattern `.row-action`
              * and `InfoTip` already use for exactly this reason.
              */
            <Link
              href="/account"
              aria-label="Account"
              title="Account"
              className="relative inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-card after:absolute after:-inset-1.5 after:content-['']"
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
