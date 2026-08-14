"use client";

import { HeaderBrand } from "@/components/HeaderBrand";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { cn } from "@/lib/format";
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
};

/**
 * The one header every page uses.
 *
 * Each page used to roll its own: four different max-widths (1400px, 6xl,
 * 4xl, 3xl) and two padding scales, so the bar visibly resized and the
 * logo jumped every time you moved between My book and Communities. A
 * fixed height and a single container width make it identical everywhere.
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
}: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-brand/25 bg-app/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 text-[15px] leading-none sm:gap-3">
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
                  "min-w-0 truncate font-medium leading-none tracking-tight",
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
