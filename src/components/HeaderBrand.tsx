"use client";

import {
  UpsideLogo,
  UPSIDE_HEADER_WORDMARK_CLASS,
} from "@/components/UpsideLogo";
import { cn } from "@/lib/format";
import Link from "next/link";

type Props = {
  className?: string;
  /** Home link (default). Ignored when `onClick` is set. */
  href?: string;
  /** Overview / in-app navigation — renders a button instead of a link. */
  onClick?: () => void;
  title?: string;
};

/**
 * App-chrome brand lockup. Always the same centered mark + UPSIDE wordmark.
 */
export function HeaderBrand({
  className,
  href = "/",
  onClick,
  title = "Upside — go home",
}: Props) {
  const logo = (
    <UpsideLogo
      variant="wordmark"
      className={UPSIDE_HEADER_WORDMARK_CLASS}
    />
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex shrink-0 items-center border-0 bg-transparent p-0 outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand/50",
          className
        )}
        title={title}
        aria-label={title}
      >
        {logo}
      </button>
    );
  }

  return (
    <Link
      href={href}
      className={cn("inline-flex shrink-0 items-center", className)}
      aria-label={title}
    >
      {logo}
    </Link>
  );
}
