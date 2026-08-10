"use client";

import { cn } from "@/lib/format";

type Props = {
  className?: string;
  /** `mark` = triangle only; `wordmark` = triangle + UPSIDE; `icon` = circular badge */
  variant?: "mark" | "wordmark" | "icon";
  title?: string;
};

export function UpsideLogo({
  className,
  variant = "wordmark",
  title = "Upside",
}: Props) {
  if (variant === "icon") {
    return (
      <svg
        viewBox="0 0 128 128"
        className={cn("shrink-0", className)}
        role="img"
        aria-label={title}
      >
        <circle cx="64" cy="64" r="64" fill="#0B111B" />
        <path d="M64 30 L90 68 H38 Z" fill="#FFFFFF" />
        <text
          x="64"
          y="96"
          textAnchor="middle"
          fill="#FFFFFF"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="13"
          fontWeight="700"
          letterSpacing="0.32em"
        >
          UPSIDE
        </text>
      </svg>
    );
  }

  if (variant === "mark") {
    return (
      <svg
        viewBox="0 0 24 24"
        className={cn("shrink-0", className)}
        fill="currentColor"
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
        aria-label={title}
      >
        <path d="M12 3.5 L20.5 18.5 H3.5 Z" />
      </svg>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center gap-2 text-white", className)}
      aria-label={title}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[0.95em] w-[0.95em] shrink-0"
        fill="currentColor"
        aria-hidden
      >
        <path d="M12 3.5 L20.5 18.5 H3.5 Z" />
      </svg>
      <span className="text-[0.82em] font-semibold uppercase tracking-[0.22em]">
        Upside
      </span>
    </span>
  );
}
