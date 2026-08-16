"use client";

import {
  UpsideLogo,
  UPSIDE_HEADER_WORDMARK_CLASS,
} from "@/components/UpsideLogo";
import { cn } from "@/lib/format";
import { requestGoHome } from "@/lib/workspace-rooms";
import Link from "next/link";

type Props = {
  className?: string;
};

/**
 * App-chrome brand lockup. Gold mark plus UPSIDE LAB, same as the board.
 * Always goes to Overview at /. Never stays on Compound, Pulse, or Fund.
 *
 * The pointer cursor comes from the global button rule in globals.css
 * (a real button gets an arrow by default, only a link with href gets a hand).
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
  "focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 focus-visible:ring-offset-app"
);

export function HeaderBrand({ className }: Props) {
  return (
    <Link
      href="/"
      className={cn(BRAND_INTERACTION_CLASS, className)}
      title="Upside Lab home"
      aria-label="Upside Lab home"
      onClick={() => requestGoHome()}
    >
      <UpsideLogo
        variant="wordmark"
        className={UPSIDE_HEADER_WORDMARK_CLASS}
      />
    </Link>
  );
}
