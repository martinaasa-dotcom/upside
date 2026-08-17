"use client";

import { useAuth } from "@/components/AuthProvider";
import { useFeedback } from "@/components/FeedbackHost";
import { AppStatusStrip, type AppStatusProps } from "@/components/AppStatusStrip";
import { HeaderBrand } from "@/components/HeaderBrand";
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
    <button
      type="button"
      onClick={openManual}
      className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-sm font-medium text-muted-foreground hover:border-brand hover:text-foreground"
    >
      Feedback
    </button>
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
    <Link
      href="/account"
      title="Account"
      aria-label="Account"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-card"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-xs font-semibold text-foreground/80">{initial}</span>
      )}
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
          "fixed top-0 right-0 left-0 z-40 hidden bg-app/95 backdrop-blur md:block",
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
                      "text-foreground/80"
                    )}
                  >
                    {title}
                  </span>
                </>
              )}
            </div>
            <div className="flex min-w-0 shrink items-center justify-end gap-1 sm:gap-1.5">
              {children}
              <FeedbackHeaderButton />
              {showWorkspaceNav && <WorkspaceSwitcher />}
              {end ?? <DefaultAccountEnd />}
            </div>
          </div>
        </div>
      </header>
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 bg-app/95 backdrop-blur md:fixed md:top-14 md:right-0 md:left-0 md:z-40">
        <AppStatusStrip {...status} />
      </div>
      <div className={PAGE_CHROME_SPACER_CLASS} aria-hidden />
    </>
  );
}
