"use client";

import { cn } from "@/lib/format";
import { PRODUCT_NAME } from "@/lib/product";
import { useId } from "react";

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

/** Ten-facet gold A, traced from the source mark. Light from upper-right. */
const MARK_FACETS: { points: string; hi: string; lo: string }[] = [
  { points: "48.56,12.14 48.66,44.59 28.65,44.69", hi: "#dfc59a", lo: "#a6875d" },
  { points: "51.34,12.14 71.25,44.69 51.24,44.59", hi: "#ead6ab", lo: "#b29a6f" },
  { points: "28.94,47.37 48.85,47.37 39.37,64.79", hi: "#caac7a", lo: "#8f6b3a" },
  { points: "51.05,47.37 70.87,47.46 60.91,64.88", hi: "#dfc59b", lo: "#a5875e" },
  { points: "73.45,48.23 83.98,66.03 63.59,66.03", hi: "#dec59b", lo: "#a5875e" },
  { points: "26.45,48.32 36.60,66.03 16.02,66.03", hi: "#caaa77", lo: "#8e6937" },
  { points: "16.40,68.81 37.08,68.81 26.84,86.61", hi: "#b38e62", lo: "#764b1f" },
  { points: "63.02,68.81 83.50,68.81 73.36,86.52", hi: "#cbad7b", lo: "#906d3b" },
  { points: "86.09,69.58 97.00,87.86 76.04,87.86", hi: "#caab79", lo: "#8f6b39" },
  { points: "13.82,69.67 24.15,87.86 3.00,87.86", hi: "#b38e61", lo: "#764b1e" },
];

function UpsideMark({
  className,
  /** Crop to the drawn A so splash sizes are visual size, not padded square. */
  tight = false,
}: {
  className?: string;
  tight?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      viewBox={tight ? "3 12 94 76" : "0 0 100 100"}
      className={cn("block shrink-0", className)}
      fill="none"
      aria-hidden
    >
      <defs>
        {MARK_FACETS.map((f, i) => (
          <linearGradient
            key={i}
            id={`${uid}m${i}`}
            x1="72"
            y1="10"
            x2="18"
            y2="90"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor={f.hi} />
            <stop offset="1" stopColor={f.lo} />
          </linearGradient>
        ))}
      </defs>
      {MARK_FACETS.map((f, i) => (
        <polygon key={i} points={f.points} fill={`url(#${uid}m${i})`} />
      ))}
    </svg>
  );
}

/**
 * Side-by-side lockup: the A is a triangle in a square viewBox, so its
 * mass sits low. A small lift lines it up with the caps. Too much and
 * the peak sits above UPSIDE.
 */
const LOCKUP_MARK_NUDGE = "-translate-y-[0.1em]";

/** Lockup type: UPSIDE bold, LAB regular. Same Montserrat as every heading. */
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
        <UpsideMark tight className="h-[10.5rem] w-[13rem]" />
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
      <LogoType className={alwaysType ? undefined : "hidden xs:inline"} />
    </span>
  );
}
