/**
 * One column for every signed-in page. Header, banners, main, and the
 * book dock all use this, so Book → Fund → Communities does not move
 * the side gutters or the page pad.
 */
export const PAGE_MAX_CLASS = "max-w-[1400px]";
export const PAGE_GUTTER_CLASS = "px-4 sm:px-6";
export const PAGE_COLUMN_CLASS = `mx-auto w-full min-w-0 ${PAGE_MAX_CLASS} ${PAGE_GUTTER_CLASS}`;

export const PAGE_FRAME_CLASS =
  "flex min-h-dvh flex-col bg-app text-foreground [--dock-pad:5.25rem] md:bg-[radial-gradient(ellipse_at_top,_#2d3d32_0%,_#1a2820_55%)] md:[--dock-pad:7.75rem]";

export const PAGE_MAIN_CLASS = `${PAGE_COLUMN_CLASS} flex flex-1 flex-col gap-6 py-6 pb-[calc(var(--dock-pad)+env(safe-area-inset-bottom))] sm:gap-8 sm:py-8`;
