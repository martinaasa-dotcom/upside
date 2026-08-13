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
 * Shared so the wordmark behaves identically whether it renders as a link
 * (marketing/legal pages) or a button (in-app, navigates to Overview).
 *
 * The pointer cursor comes from the global button rule in globals.css
 * (browsers give <button> an arrow by default, only <a href> gets a hand).
 *
 * The hover itself stays deliberately small, a slight lift plus a touch
 * more brightness so the metallic mark catches light. Movement is behind
 * motion-safe; the brightness still lands for reduced-motion users.
 */
const BRAND_INTERACTION_CLASS = cn(
  "inline-flex shrink-0 items-center rounded-md border-0 bg-transparent p-0",
  "outline-none transition duration-200 ease-out",
  "hover:brightness-110 active:brightness-95",
  "motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0",
  "focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121214]"
);

/**
 * App-chrome brand lockup. Always the same centered mark + UPSIDE wordmark.
 */
export function HeaderBrand({
  className,
  href = "/",
  onClick,
  title = "Back to your book",
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
        className={cn(BRAND_INTERACTION_CLASS, className)}
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
      className={cn(BRAND_INTERACTION_CLASS, className)}
      title={title}
      aria-label={title}
    >
      {logo}
    </Link>
  );
}
