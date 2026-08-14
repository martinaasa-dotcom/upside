"use client";

import { cn } from "@/lib/format";
import { PRODUCT_NAME } from "@/lib/product";

type Props = {
  className?: string;
  /** `mark` = faceted delta only; `wordmark` = mark + UPSIDE LAB; `icon` = stacked lockup */
  variant?: "mark" | "wordmark" | "icon";
  title?: string;
};

/** Canonical header chrome size — keep every app bar on the same lockup. */
export const UPSIDE_HEADER_WORDMARK_CLASS =
  "text-[15px] leading-none text-white";

/** Faceted gold delta — light from upper-right. Gold lives on the mark. */
function UpsideMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("block shrink-0", className)}
      fill="none"
      aria-hidden
    >
      <polygon points="50.00,4.00 34.67,34.67 50.00,28.00" fill="#D6AD69" />
      <polygon points="50.00,4.00 50.00,28.00 65.33,34.67" fill="#EED7B5" />
      <polygon points="34.67,34.67 37.00,40.00 50.00,28.00" fill="#9C723F" />
      <polygon points="50.00,28.00 37.00,40.00 63.00,40.00" fill="#D6AD69" />
      <polygon points="50.00,28.00 63.00,40.00 65.33,34.67" fill="#D6AD69" />
      <polygon points="34.67,34.67 19.33,65.33 37.00,40.00" fill="#7A5A32" />
      <polygon points="37.00,40.00 19.33,65.33 50.00,62.00" fill="#5C4328" />
      <polygon points="65.33,34.67 63.00,40.00 80.67,65.33" fill="#EED7B5" />
      <polygon points="63.00,40.00 50.00,62.00 80.67,65.33" fill="#D6AD69" />
      <polygon points="19.33,65.33 4.00,96.00 28.00,96.00" fill="#5C4328" />
      <polygon points="19.33,65.33 28.00,96.00 50.00,62.00" fill="#7A5A32" />
      <polygon points="80.67,65.33 72.00,96.00 96.00,96.00" fill="#9C723F" />
      <polygon points="80.67,65.33 50.00,62.00 72.00,96.00" fill="#D6AD69" />
    </svg>
  );
}

export function UpsideLogo({
  className,
  variant = "wordmark",
  title = PRODUCT_NAME,
}: Props) {
  if (variant === "icon") {
    return (
      <span
        className={cn(
          "inline-flex flex-col items-center justify-center gap-3",
          className
        )}
        role="img"
        aria-label={title}
      >
        <span className="flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-[1.2rem] border border-brand bg-[#0C1014] p-2.5">
          <UpsideMark className="h-full w-full" />
        </span>
        <span className="-mr-[0.18em] text-center font-heading text-[0.95rem] font-bold uppercase leading-none tracking-[0.22em] text-white">
          Upside Lab
        </span>
      </span>
    );
  }

  if (variant === "mark") {
    return (
      <span className={cn("inline-flex", className)} role="img" aria-label={title}>
        <UpsideMark className="h-full w-full" />
      </span>
    );
  }

  // Wordmark: true vertical center — mark midline = cap midline.
  // `items-center` plus a small upward nudge on the mark corrects the
  // optical center (the all-caps line-box has unused descender room).
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 leading-none text-white",
        className
      )}
      role="img"
      aria-label={title}
    >
      <UpsideMark className="h-[1.15em] w-[1.15em] -translate-y-[0.06em]" />
      <span className="-mr-[0.18em] hidden font-heading font-bold uppercase leading-none tracking-[0.18em] xs:inline">
        Upside Lab
      </span>
    </span>
  );
}
