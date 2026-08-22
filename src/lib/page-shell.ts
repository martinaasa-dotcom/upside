/**
 * One column for every signed-in page. Header, banners, main, and the
 * book dock all use this, so Book → Fund → Communities does not move
 * the side gutters or the page pad.
 */
export const PAGE_MAX_CLASS = "max-w-[1200px]";
/**
 * 16px on a phone, 24px from `sm` up.
 *
 * A flat 24px was 48px of the 390px a phone actually has — an eighth of
 * the screen spent on margin before a card's own padding starts, which is
 * where several of the "it bleeds outside the box" readings came from:
 * a two-up score cell was left with about 118px of content. It also put
 * the page column on a different edge from the phone chrome, which sits at
 * 16px, so the top bar's wordmark and the dock never lined up with the
 * cards between them. Both are the same 8px.
 */
export const PAGE_GUTTER_CLASS = "px-4 sm:px-6";
export const PAGE_COLUMN_CLASS = `mx-auto w-full min-w-0 ${PAGE_MAX_CLASS} ${PAGE_GUTTER_CLASS}`;

export const PAGE_FRAME_CLASS =
  "page-frame flex min-h-dvh flex-col bg-background text-foreground [--dock-pad:10.5rem] md:[--dock-pad:11.5rem]";

/**
 * Desktop chrome, measured on the running app: header row 3rem + status row
 * 2.25rem + the status strip's own `border-b` = **85px**, not 84.
 *
 * The spacer reserves that height in the document, so it and the chrome's
 * two rows move together: change either row and this is wrong.
 *
 * The hairline is easy to forget, and it was: at a flat `h-21` the spacer
 * reserved 84px for 85px of chrome, so the page's top pixel row sat under
 * the chrome's bottom edge. It is one pixel, and it is the whole reason
 * this is written as arithmetic rather than as a rounded number — the
 * border is part of the chrome's height whether or not anyone counted it.
 *
 * Written out literally rather than composed from a shared constant:
 * Tailwind extracts classes by scanning source text, so a template literal
 * produces a class name that never gets a rule, and the spacer silently
 * collapses to zero. The underscores are Tailwind's escape for the spaces
 * `calc()` requires around its `+`.
 *
 * A matching `PAGE_CHROME_STICKY_CLASS` used to sit here, for parking a
 * sticky panel on the chrome's line. Its last call site was the Compound
 * page's left column, which stopped being sticky on 2026-08-21 because the
 * sticky box cut its own form off below the fold. An exported constant
 * nothing imports reads as "some surface uses this", so it is gone rather
 * than left as spare capacity; it was `lg:top-[calc(5.25rem_+_1px)]`, one
 * line to bring back beside this one if a panel needs it again.
 */
export const PAGE_CHROME_SPACER_CLASS =
  "hidden h-[calc(5.25rem_+_1px)] shrink-0 md:block";

/** Top pad only. Bottom pad is the live dock height. A shorthand
 * vertical pad would wipe that clearance and hide the last section. */
export const PAGE_MAIN_CLASS = `${PAGE_COLUMN_CLASS} flex flex-1 flex-col gap-6 pt-6 pb-[var(--dock-pad)]`;
