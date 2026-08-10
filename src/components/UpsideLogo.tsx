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
      <svg
        viewBox="0 0 200 240"
        className={cn("shrink-0", className)}
        role="img"
        aria-label={title}
      >
        <g transform="translate(40, 10) scale(1.2)">
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
        </g>
        <text
          x="100"
          y="220"
          textAnchor="middle"
          fill="#FFFFFF"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="22"
          fontWeight="600"
          letterSpacing="0.42em"
        >
          UPSIDE
        </text>
      </svg>
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
        "inline-flex items-center gap-2 leading-none text-white",
        className
      )}
      aria-label={title}
    >
      <UpsideMark className="h-[1.2em] w-[1.2em]" />
      <span className="translate-y-[0.08em] text-[0.92em] font-semibold uppercase tracking-[0.28em]">
        Upside
      </span>
    </span>
  );
}
