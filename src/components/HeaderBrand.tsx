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
  /** Keep UPSIDE LAB visible on the phone bar. Desktop already has the width. */
  alwaysType?: boolean;
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
  // `touch-target` because this is a real link home, not decoration, and
  // the wordmark's own box is only 20px tall — under both platform
  // minimums on a phone. The 44px floor fits inside the 56px header, so
  // nothing about the chrome's height moves.
  "touch-target inline-flex shrink-0 items-center rounded-md border-0 bg-transparent p-0",
  "outline-none transition duration-200 ease-out",
  "hover:brightness-110 active:brightness-95",
  "motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0",
  "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
);

export function HeaderBrand({ className, alwaysType = false }: Props) {
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
        alwaysType={alwaysType}
        className={UPSIDE_HEADER_WORDMARK_CLASS}
      />
    </Link>
  );
}
