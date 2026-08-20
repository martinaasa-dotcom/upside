"use client";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/components/AuthProvider";
import { useFeedback } from "@/components/FeedbackHost";
import { AppStatusStrip, type AppStatusProps } from "@/components/AppStatusStrip";
import { HeaderBrand } from "@/components/HeaderBrand";
import { UpgradeNudge } from "@/components/billing/UpgradeNudge";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { cn } from "@/lib/format";
import { PAGE_CHROME_SPACER_CLASS, PAGE_COLUMN_CLASS } from "@/lib/page-shell";
import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  /** Where you currently are: a sheet name, or the page name. */
  title?: ReactNode;
  /** Page-specific controls. Sit left of the workspace nav on the right. */
  children?: ReactNode;
  /** Always last on the right: account avatar, never a workspace room. */
  end?: ReactNode;
  /** Hidden while a page has no workspace context to switch within. */
  showWorkspaceNav?: boolean;
  className?: string;
  status?: AppStatusProps;
};

function FeedbackHeaderButton() {
  const { user } = useAuth();
  const { openManual } = useFeedback();
  if (!user) return null;
  return (
    <Button type="button" variant="ghost" size="sm" onClick={openManual}>
      Feedback
    </Button>
  );
}

function DefaultAccountEnd() {
  const { user, profile } = useAuth();
  if (!user) return null;
  const initial = (profile?.display_name || user.email || "?")
    .trim()
    .charAt(0)
    .toUpperCase();
  const url = profile?.avatar_url;
  return (
    <Link href="/account" title="Account" aria-label="Account">
      <Avatar className="size-8 rounded-md">
        {url ? <AvatarImage src={url} alt="" /> : null}
        <AvatarFallback className="rounded-md text-xs font-medium">
          {initial}
        </AvatarFallback>
      </Avatar>
    </Link>
  );
}

/**
 * The one header every signed-in page uses.
 *
 * Fixed on desktop so Book → Fund → Communities does not move the bar.
 * Header row is 3.5rem. Status row is 2.5rem. Spacer matches both.
 */
export function AppHeader({
  title,
  children,
  end,
  showWorkspaceNav = true,
  className,
  status,
}: Props) {
  return (
    <>
      <header
        className={cn(
          "fixed top-0 right-0 left-0 z-40 hidden bg-background/75 backdrop-blur-xl md:block",
          className
        )}
      >
        <div className="border-b border-border">
          <div
            className={cn(
              PAGE_COLUMN_CLASS,
              "flex h-14 items-center justify-between gap-2 sm:gap-3"
            )}
          >
            <div className="flex min-w-0 items-center gap-2 text-sm leading-none sm:gap-3">
              <HeaderBrand />
              {title != null && (
                <>
                  <span
                    className="hidden h-3.5 w-px shrink-0 bg-border sm:block"
                    aria-hidden
                  />
                  <span
                    className={cn(
                      "min-w-0 truncate font-medium leading-none",
                      "text-muted-foreground"
                    )}
                  >
                    {title}
                  </span>
                </>
              )}
            </div>
            <div className="flex min-w-0 shrink items-center justify-end gap-2">
              {children}
              <UpgradeNudge />
              <FeedbackHeaderButton />
              {showWorkspaceNav && (
                <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
              )}
              {showWorkspaceNav && <WorkspaceSwitcher />}
              <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
              {end ?? <DefaultAccountEnd />}
            </div>
          </div>
        </div>
      </header>
      {/*
       * Same translucent glass as the header above it, not `bg-background`.
       * An opaque strip here ended the page's ambient glow at a razor edge
       * — measured as a 0 -> 45 luminance step across ~2 CSS px right under
       * the chrome — which read as the glow being "clipped by the header."
       * The glow itself is `position: fixed` and always did sit behind the
       * chrome; it was this slab painting over it.
       */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 bg-background/75 backdrop-blur-xl md:fixed md:top-14 md:right-0 md:left-0 md:z-40">
        <AppStatusStrip {...status} />
      </div>
      <div className={PAGE_CHROME_SPACER_CLASS} aria-hidden />
    </>
  );
}
