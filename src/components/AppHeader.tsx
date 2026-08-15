"use client";

import { HeaderBrand } from "@/components/HeaderBrand";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { cn } from "@/lib/format";
import { PAGE_COLUMN_CLASS } from "@/lib/page-shell";
import type { ReactNode } from "react";

type Props = {
  /** Where you currently are: a sheet name, or the page name. */
  title?: ReactNode;
  /** Page-specific controls. Sit left of the workspace nav on the right. */
  children?: ReactNode;
  /** Always last on the right: account avatar, never a workspace room. */
  end?: ReactNode;
  /** In-app navigation instead of an <a href="/">, for the Dashboard where
   * going "home" means switching tab rather than a page load. */
  onBrandClick?: () => void;
  brandTitle?: string;
  /** Hidden while a page has no workspace context to switch within. */
  showWorkspaceNav?: boolean;
  className?: string;
};

/**
 * The one header every page uses.
 *
 * Same column as every page main (PAGE_COLUMN_CLASS). A fixed height and
 * one gutter so the logo does not jump when you move between rooms.
 *
 * Layout rule: the left is only ever the wordmark plus where you are; every
 * control lives on the right.
 */
export function AppHeader({
  title,
  children,
  end,
  onBrandClick,
  brandTitle,
  showWorkspaceNav = true,
  className,
}: Props) {
  return (
    <header className={cn("sticky top-0 z-40 border-b border-white/10 bg-app/95 backdrop-blur", className)}>
      <div className={cn(PAGE_COLUMN_CLASS, "flex h-14 items-center justify-between gap-2 sm:gap-3")}>
        <div className="flex min-w-0 items-center gap-2 text-sm leading-none sm:gap-3">
          <HeaderBrand
            onClick={onBrandClick}
            {...(brandTitle ? { title: brandTitle } : {})}
          />
          {title != null && (
            <>
              <span
                className="hidden h-3.5 w-px shrink-0 bg-zinc-700 sm:block"
                aria-hidden
              />
              <span
                className={cn(
                  "min-w-0 truncate font-medium leading-none",
                  "text-zinc-300"
                )}
              >
                {title}
              </span>
            </>
          )}
        </div>
        <div className="flex min-w-0 shrink items-center justify-end gap-1 sm:gap-1.5">
          {children}
          {showWorkspaceNav && <WorkspaceSwitcher />}
          {end}
        </div>
      </div>
    </header>
  );
}
