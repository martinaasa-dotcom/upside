"use client";

import { cn } from "@/lib/format";
import { PRODUCT_NAME } from "@/lib/product";
import { useId } from "react";

type Props = {
  className?: string;
  /** `mark` = faceted A only; `wordmark` = mark + name; `icon` = large lockup */
  variant?: "mark" | "wordmark" | "icon";
  title?: string;
};

/** Canonical header chrome size — keep every app bar on the same lockup. */
export const UPSIDE_HEADER_WORDMARK_CLASS =
  "text-[14px] leading-none text-white";

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

function UpsideMark({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 100 100"
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

/** Brand-board type: UPSIDE bold, LAB regular. CSS caps, spoken name stays title case. */
function LogoType({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-logo uppercase leading-none tracking-wide text-white",
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
}: Props) {
  if (variant === "mark") {
    return (
      <span className={cn("inline-flex", className)} role="img" aria-label={title}>
        <UpsideMark className="h-full w-full" />
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
        <UpsideMark className="h-[1.15em] w-[1.15em]" />
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
      <UpsideMark className="h-[1.25em] w-[1.25em]" />
      <LogoType className="hidden xs:inline" />
    </span>
  );
}
