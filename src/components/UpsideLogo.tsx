"use client";

import { useId } from "react";
import { cn } from "@/lib/format";
import { PRODUCT_NAME } from "@/lib/product";

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

/**
 * Ten-facet gold A, inline vector.
 *
 * This was a 260 KB, 878x713 PNG rendered at roughly 14 px in the app bar
 * of every page. On a throttled cold load it took 4.3 s to arrive and was
 * the single biggest contributor to a 4.75 s LCP against a 2.5 s budget —
 * a quarter-megabyte download to draw ten triangles a centimetre wide.
 *
 * Inline SVG rather than `next/image` on purpose: the mark is flat
 * geometry, so this is about 2 KB, needs no network request at all (which
 * is what actually removes it from the LCP path), stays sharp at any size,
 * and cannot pop in after the text around it. The same polygons back the
 * favicon and the BIMI mark, so the three stay identical.
 *
 * `gradientUnits="objectBoundingBox"` would be simpler, but the source
 * geometry is in user space and re-deriving the stops risks shifting the
 * bevel, so the original userSpaceOnUse coordinates are kept verbatim.
 * Gradient ids are prefixed to avoid colliding with any other inline SVG
 * on the page.
 */
function UpsideMark({ className }: { className?: string }) {
  /*
   * Unique gradient ids per instance, and this is load-bearing rather than
   * tidiness.
   *
   * The lockup renders more than once per page -- the mobile top bar and
   * the desktop header both mount, with one hidden by a breakpoint. Both
   * emitted `upside-mark-g0..9`, so `url(#upside-mark-g0)` resolved to the
   * FIRST match in document order, which is the copy inside the hidden
   * header. A paint server in a `display:none` subtree does not paint, so
   * the visible mark filled with nothing: it held its 24x20 box and drew
   * absolutely nothing, which is exactly what "the logo is missing" looks
   * like.
   *
   * The old comment here said the prefix avoided colliding "with any other
   * inline SVG on the page" -- true, and beside the point. It collided with
   * a second copy of itself.
   *
   * `useId` is stable across server and client render, so this does not
   * cause a hydration mismatch. The punctuation React puts in the value is
   * legal in an id but awkward in a URL fragment, so it is stripped.
   */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const facets: [string, string, string][] = [
    ["62.61,20.27 62.72,56.43 40.43,56.53", "#dfc59a", "#a6875d"],
    ["65.71,20.27 87.89,56.53 65.60,56.43", "#ead6ab", "#b29a6f"],
    ["40.75,59.52 62.93,59.52 52.37,78.93", "#caac7a", "#8f6b3a"],
    ["65.39,59.52 87.47,59.63 76.37,79.04", "#dfc59b", "#a5875e"],
    ["90.35,60.48 102.08,80.32 79.36,80.32", "#dec59b", "#a5875e"],
    ["37.97,60.59 49.28,80.32 26.35,80.32", "#caaa77", "#8e6937"],
    ["26.77,83.41 49.81,83.41 38.40,103.25", "#b38e62", "#764b1f"],
    ["78.72,83.41 101.55,83.41 90.24,103.15", "#cbad7b", "#906d3b"],
    ["104.43,84.27 116.59,104.64 93.23,104.64", "#caab79", "#8f6b39"],
    ["23.89,84.37 35.41,104.64 11.84,104.64", "#b38e61", "#764b1e"],
  ];
  return (
    <svg
      /*
       * Tight to the artwork, which spans x 11.84..116.59 and
       * y 20.27..104.64 -- 104.75 x 84.37, an aspect of 1.2416.
       *
       * This was `0 0 128 128` with the polygons pushed into it by a
       * `translate(14 18) scale(0.78)`, which left roughly a third of the
       * box as empty padding. Harmless at splash size and ruinous in the
       * app bar: inside a 1.4em square the mark drew about 12 px and read
       * as missing. The PNG this replaced was a tight crop (878x713, the
       * same 1.23 aspect), so it filled whatever box it was given -- the
       * padding is what changed when it became inline geometry, not the
       * drawing.
       */
      viewBox="11.84 20.27 104.75 84.37"
      aria-hidden
      focusable="false"
      className={cn("block shrink-0", className)}
    >
      <defs>
        {facets.map(([, from, to], i) => (
          <linearGradient
            key={i}
            id={`upside-mark-${uid}-g${i}`}
            x1="78"
            y1="18"
            x2="28"
            y2="108"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        ))}
      </defs>
      {/*
        * No wrapping transform. The polygon coordinates and the gradients'
        * userSpaceOnUse coordinates were always in the same space, so
        * dropping the group leaves the bevel exactly where it was.
        */}
      {facets.map(([points], i) => (
        <polygon key={i} points={points} fill={`url(#upside-mark-${uid}-g${i})`} />
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

/** Lockup type: UPSIDE bold, LAB regular. Same Geist as the rest of the UI. */
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
        <UpsideMark className="h-[10.5rem] w-[13rem]" />
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
        <UpsideMark className={cn("h-[1.35em] w-[1.68em]", LOCKUP_MARK_NUDGE)} />
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
      <UpsideMark className={cn("h-[1.4em] w-[1.74em]", LOCKUP_MARK_NUDGE)} />
      <LogoType
        className={
          alwaysType ? "max-[22.5rem]:hidden" : "hidden xs:inline"
        }
      />
    </span>
  );
}
