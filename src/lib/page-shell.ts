/**
 * One column for every signed-in page. Header, banners, main, and the
 * book dock all use this, so Book → Fund → Communities does not move
 * the side gutters or the page pad.
 */
export const PAGE_MAX_CLASS = "max-w-[1200px]";
export const PAGE_GUTTER_CLASS = "px-6";
export const PAGE_COLUMN_CLASS = `mx-auto w-full min-w-0 ${PAGE_MAX_CLASS} ${PAGE_GUTTER_CLASS}`;

export const PAGE_FRAME_CLASS =
  "page-frame flex min-h-dvh flex-col bg-background text-foreground [--dock-pad:10.5rem] md:[--dock-pad:11.5rem]";

/**
 * Desktop chrome is fixed: header 3rem + status 2.25rem = 5.25rem.
 *
 * These three move together. The spacer reserves the chrome's height in the
 * document, and the sticky offset parks anything below it at the same line;
 * change one row's height and all three numbers here are wrong at once.
 */
export const PAGE_CHROME_SPACER_CLASS = "hidden h-21 shrink-0 md:block";
export const PAGE_CHROME_STICKY_CLASS = "lg:top-21";

/** Top pad only. Bottom pad is the live dock height. A shorthand
 * vertical pad would wipe that clearance and hide the last section. */
export const PAGE_MAIN_CLASS = `${PAGE_COLUMN_CLASS} flex flex-1 flex-col gap-6 pt-6 pb-[var(--dock-pad)]`;
