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
 * Header row is 3rem, status row 2.25rem, plus the strip's own hairline:
 * 85px, which is what `PAGE_CHROME_SPACER_CLASS` reserves.
 * Tightened from 3.5/2.5: at those heights the markets bar sat a clear
 * step below the header row rather than reading as its second line.
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
      {/*
       * One pane, not two.
       *
       * The header row and the status strip used to be two sibling fixed
       * elements, each with its own `bg-background/*` fill and its own
       * `backdrop-blur`. Two blurs stacked on two backdrops do not read as
       * one sheet of glass: each samples a different slice of what is
       * behind it, so the two bands came out at visibly different tones
       * with a seam between them. The fix is structural rather than
       * tonal — one fill, one blur, both rows inside it, and a hairline
       * where the rows meet.
       *
       * Still one `<AppStatusStrip>` instance, deliberately: it holds a
       * one-second interval and a visibilitychange listener, so rendering
       * it once per breakpoint would run two of each. Instead this single
       * wrapper changes behaviour at `md` — below it the header row is
       * hidden and the wrapper is just the strip sticking under the mobile
       * top bar; at and above it the wrapper pins to the top and carries
       * both rows.
       */}
      <div
        className={cn(
          "sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 bg-background/35 backdrop-blur-2xl",
          "md:fixed md:inset-x-0 md:top-0 md:z-40",
          className
        )}
      >
        {/*
         * No `border-b` here. This wrapper is one sheet of glass, and a
         * rule between the two rows inside it is exactly what made the
         * chrome read as two stacked panes -- which was the original
         * complaint, and merging the fills alone did not settle it because
         * the line survived the merge. The only edge the chrome carries is
         * the one at its bottom, where it meets the page; the strip below
         * draws that.
         */}
        <header className="hidden md:block">
          <div
            className={cn(
              PAGE_COLUMN_CLASS,
              "flex h-12 items-center justify-between gap-2 sm:gap-3"
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
        </header>
        {/*
         * `--background` is pure black, so this fill is a black veil and
         * its alpha is exactly how much of the ambient glow it eats. It
         * started opaque, which ended the glow at a razor edge right under
         * the chrome — measured as a 0 -> 45 luminance step across ~2 CSS
         * px — and read as the glow being "clipped by the header". The
         * glow is `position: fixed` and always did sit behind the chrome;
         * it was this slab painting over it.
         *
         * The blur does the legibility work, not the opacity: anything
         * scrolling under becomes a soft wash, and the field it sits on
         * peaks at 43/255 in the warm corner, so header text measures far
         * above AAA
         * against it. Do not raise this back toward opaque to "fix"
         * contrast without measuring it first.
         */}
        <AppStatusStrip {...status} />
      </div>
      <div className={PAGE_CHROME_SPACER_CLASS} aria-hidden />
    </>
  );
}
