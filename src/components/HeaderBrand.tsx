"use client";

import {
  UpsideLogo,
  UPSIDE_HEADER_WORDMARK_CLASS,
} from "@/components/UpsideLogo";
import { usePaperClass } from "@/components/PaperClassProvider";
import { cn } from "@/lib/format";
import { paperClassHomeHref } from "@/lib/paper-class-cache";
import { requestGoHome } from "@/lib/workspace-rooms";
import Link from "next/link";

type Props = {
  className?: string;
  /** Keep UPSIDE LAB visible on the phone bar. Desktop already has the width. */
  alwaysType?: boolean;
};

/**
 * Gold mark plus UPSIDE LAB. Goes to Overview at /, except a paper-class
 * account which goes back to the class.
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

export function HeaderBrand({ className, alwaysType = false }: Props) {
  const paper = usePaperClass();
  const href = paper.only ? paperClassHomeHref(paper.classIds) : "/";
  return (
    <Link
      href={href}
      className={cn(BRAND_INTERACTION_CLASS, className)}
      title={paper.only ? "Back to class" : "Upside Lab home"}
      aria-label={paper.only ? "Back to class" : "Upside Lab home"}
      onClick={() => {
        if (!paper.only) requestGoHome();
      }}
    >
      <UpsideLogo
        variant="wordmark"
        alwaysType={alwaysType}
        className={UPSIDE_HEADER_WORDMARK_CLASS}
      />
    </Link>
  );
}
