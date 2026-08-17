"use client";

import { cn } from "@/lib/format";
import { PRODUCT_NAME } from "@/lib/product";

type Props = {
  className?: string;
  /** `mark` = A only; `wordmark` = inline lockup; `icon` = large inline; `stack` = splash */
  variant?: "mark" | "wordmark" | "icon" | "stack";
  title?: string;
  /** Keep UPSIDE LAB visible on narrow screens (mobile app bar). */
  alwaysType?: boolean;
};

/** Canonical header chrome size — keep every app bar on the same lockup. */
export const UPSIDE_HEADER_WORDMARK_CLASS =
  "text-[14px] leading-none text-foreground";

/** Ten-facet gold A. Raster of the same mark used on X, favicon, and OG. */
function UpsideMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static header mark, not a photo
    <img
      src="/upside-mark.png?v=3"
      alt=""
      draggable={false}
      className={cn("block shrink-0 object-contain", className)}
    />
  );
}

/**
 * Side-by-side lockup: the A is a triangle in a square viewBox, so its
 * mass sits low. A small lift lines it up with the caps. Too much and
 * the peak sits above UPSIDE.
 */
const LOCKUP_MARK_NUDGE = "-translate-y-[0.1em]";

/** Lockup type: UPSIDE bold, LAB regular. Same Geist as the rest of the UI. */
function LogoType({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-logo uppercase leading-none tracking-wide text-foreground",
        className
      )}
    >
      <span className="font-bold">Upside</span>
      <span className="font-normal"> Lab</span>
    </span>
  );
}

export function UpsideLogo({
  className,
  variant = "wordmark",
  title = PRODUCT_NAME,
  alwaysType = false,
}: Props) {
  if (variant === "mark") {
    return (
      <span className={cn("inline-flex", className)} role="img" aria-label={title}>
        <UpsideMark className="h-full w-full" />
      </span>
    );
  }

  if (variant === "stack") {
    return (
      <span
        className={cn("inline-flex flex-col items-center", className)}
        role="img"
        aria-label={title}
      >
        <UpsideMark className="h-[10.5rem] w-[13rem]" />
        <span className="mt-10 font-logo text-[2.75rem] font-bold uppercase leading-none tracking-wide text-foreground">
          Upside
        </span>
        <span className="mt-4 font-logo text-[2.05rem] font-normal uppercase leading-none tracking-wide text-foreground">
          Lab
        </span>
      </span>
    );
  }

  if (variant === "icon") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-3.5 text-[1.75rem] leading-none",
          className
        )}
        role="img"
        aria-label={title}
      >
        <UpsideMark className={cn("h-[1.35em] w-[1.35em]", LOCKUP_MARK_NUDGE)} />
        <LogoType />
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center gap-2.5 leading-none", className)}
      role="img"
      aria-label={title}
    >
      <UpsideMark className={cn("h-[1.4em] w-[1.4em]", LOCKUP_MARK_NUDGE)} />
      <LogoType
        className={
          alwaysType ? "max-[22.5rem]:hidden" : "hidden xs:inline"
        }
      />
    </span>
  );
}
