/**
 * How the bottom dock decides whether your portfolios fit in the row.
 *
 * The dock is one well of equal cells: the app sections, then one cell per
 * portfolio you own, then Circle. That is deliberate — the old bar kept
 * half its width open for a scrolling rail of portfolio tabs, which for
 * most people is a rail with one thing in it. One portfolio should cost
 * one cell, and no portfolios should cost nothing.
 *
 * The other end still needs an answer, though. Two different things can
 * run out at once: the row can outgrow the page column, and it can stay
 * inside the column while squeezing every cell too narrow to read. So the
 * rule is both a cell count and a measured width, and past either of them
 * the portfolios fold into a single cell that opens a list — which is also
 * the point where reading them as a row stops beating reading them as a
 * menu.
 */

/** Cells the row can carry before the sheets fold into one. */
export const MAX_DOCK_CELLS = 9;

/**
 * Narrowest a cell may get. `Growth` is the longest section label and
 * measures ~90px with its glyph, the 6px gap, and `px-2` either side, so
 * this is that plus slack. Below it a section label starts truncating,
 * and a section is a fixed word the reader cannot infer from a stub.
 */
export const MIN_CELL_PX = 96;

/** The add cell is a glyph, not a label, so it gets a narrow track. */
export const ADD_CELL_PX = 40;

/**
 * `modeCount` is the app sections actually showing (the viewer's tier can
 * hide some); the `+ 1` is Circle, which is always there.
 *
 * `availablePx` is the row's own width. Pass `null` before it has been
 * measured — the first paint then assumes the row fits, which is right for
 * every desktop wide enough to be showing this dock at all, and a resize
 * observer corrects the narrow ones on mount.
 */
export function dockFoldsSheets(
  modeCount: number,
  sheetCount: number,
  availablePx: number | null = null,
  hasAddCell = false
): boolean {
  const cells = modeCount + 1 + sheetCount;
  if (cells > MAX_DOCK_CELLS) return true;
  if (availablePx == null || availablePx <= 0) return false;
  return cells * MIN_CELL_PX + (hasAddCell ? ADD_CELL_PX : 0) > availablePx;
}
