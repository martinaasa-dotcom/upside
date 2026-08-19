import { cn } from "@/lib/format";
import type { ReactNode } from "react";

/** Equal tracks. Every column gets the same share of leftover width. */
export function equalCols(count: number): string {
  return `repeat(${count}, minmax(0, 1fr))`;
}

/**
 * Width of the trailing row-action track (the per-row delete). Fixed, not
 * `1fr`, so the action never competes with the data columns for space and
 * a wide value can never overflow into it.
 */
export const ACTION_COL = "1.75rem";

/**
 * Ticker column sizes to the cashtag (and chip, when mixed). The rest share
 * leftover equally. `action` appends a fixed narrow track for a row action.
 */
export function tableCols(
  count: number,
  tickerFit: boolean,
  action = false
): string {
  const base = tickerFit
    ? `max-content repeat(${Math.max(0, count - 1)}, minmax(0, 1fr))`
    : equalCols(count);
  return action ? `${base} ${ACTION_COL}` : base;
}

/**
 * Full-width CSS grid. `px-1.5` plus each cell's `px-1.5` makes the side
 * gutter match the gap between columns. Rows break out of that pad so
 * hover and footer fills reach the card edge.
 *
 * Every row is a fixed `h-10`. Do not add min-h or extra py on cells.
 */
export function FluidTable({
  template,
  children,
  className,
}: {
  template: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]",
        className
      )}
    >
      <div
        className="grid w-full min-w-0 px-1.5 text-sm tabular-nums"
        style={{ gridTemplateColumns: template }}
      >
        {children}
      </div>
    </div>
  );
}

export function FluidRow({
  children,
  className,
  footer = false,
}: {
  children: ReactNode;
  className?: string;
  footer?: boolean;
}) {
  return (
    <div
      className={cn(
        "col-span-full -mx-1.5 box-border grid h-10 w-full grid-cols-subgrid items-center justify-items-stretch px-1.5",
        footer ? "bg-muted/60" : "border-b border-border/50 hover:bg-muted/50",
        className
      )}
    >
      {children}
    </div>
  );
}

export const cellBase =
  "flex h-full min-w-0 w-full items-center justify-center whitespace-nowrap px-1.5 py-1.5 text-center font-mono tabular-nums";

/** Left-aligned ticker + chip. Pair with `tableCols(n, true)` so leftover does not sit after the chip. */
export const cellTicker =
  "flex h-full w-max max-w-full items-center justify-start whitespace-nowrap px-1.5 py-1.5 text-left";
export const cellLast = cellBase;

export const htmlTable = "w-full table-fixed border-collapse text-sm tabular-nums";
export const htmlCell =
  "h-10 whitespace-nowrap px-1.5 py-1.5 text-center align-middle font-mono tabular-nums first:pl-3 last:pr-3";
/** Shrink-wrap the ticker column when a listing chip is showing.
 * `min-w-max` keeps table-fixed from crushing the cashtag into the next cell. */
export const htmlCellTicker =
  "h-10 w-[1%] min-w-max whitespace-nowrap py-1.5 pl-3 pr-3 text-left align-middle";
export const htmlCellFirst = htmlCell;
export const htmlCellLast = htmlCell;
