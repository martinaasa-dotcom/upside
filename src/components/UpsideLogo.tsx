"use client";

import { cn } from "@/lib/format";

type Props = {
  className?: string;
  /** `mark` = faceted A only; `wordmark` = mark + UPSIDE; `icon` = stacked lockup */
  variant?: "mark" | "wordmark" | "icon";
  title?: string;
};

/** Faceted geometric A — champagne → bronze, light from upper-right. */
function UpsideMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("shrink-0", className)}
      fill="none"
      aria-hidden
    >
      <polygon points="50.00,4.00 34.67,34.67 50.00,28.00" fill="#D4B87A" />
      <polygon points="50.00,4.00 50.00,28.00 65.33,34.67" fill="#E8D5B5" />
      <polygon points="34.67,34.67 37.00,40.00 50.00,28.00" fill="#A87E3A" />
      <polygon points="50.00,28.00 37.00,40.00 63.00,40.00" fill="#C5A059" />
      <polygon points="50.00,28.00 63.00,40.00 65.33,34.67" fill="#D4B87A" />
      <polygon points="34.67,34.67 19.33,65.33 37.00,40.00" fill="#825E2D" />
      <polygon points="37.00,40.00 19.33,65.33 50.00,62.00" fill="#6B4A22" />
      <polygon points="65.33,34.67 63.00,40.00 80.67,65.33" fill="#E8D5B5" />
      <polygon points="63.00,40.00 50.00,62.00 80.67,65.33" fill="#C5A059" />
      <polygon points="19.33,65.33 4.00,96.00 28.00,96.00" fill="#6B4A22" />
      <polygon points="19.33,65.33 28.00,96.00 50.00,62.00" fill="#825E2D" />
      <polygon points="80.67,65.33 72.00,96.00 96.00,96.00" fill="#A87E3A" />
      <polygon points="80.67,65.33 50.00,62.00 72.00,96.00" fill="#D4B87A" />
    </svg>
  );
}

export function UpsideLogo({
  className,
  variant = "wordmark",
  title = "Upside",
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
        <UpsideMark className="h-[4.5rem] w-[4.5rem]" />
        <span className="-mr-[0.35em] text-center text-[0.95rem] font-semibold uppercase tracking-[0.35em] text-white">
          Upside
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

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 leading-none text-white",
        className
      )}
      aria-label={title}
    >
      <UpsideMark className="h-[1em] w-[1em] shrink-0" />
      {/*
        Caps sit optically high in the em box vs the geometric A — drop the
        word so midlines match (mark stays put).
      */}
      <span className="-mr-[0.22em] translate-y-[0.12em] font-semibold uppercase leading-none tracking-[0.22em]">
        Upside
      </span>
    </span>
  );
}
