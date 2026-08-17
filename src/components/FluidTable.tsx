import { cn } from "@/lib/format";
import type { ReactNode } from "react";

/** Equal tracks. Every column gets the same share of leftover width. */
export function equalCols(count: number): string {
  return `repeat(${count}, minmax(0, 1fr))`;
}

/**
 * Full-width CSS grid. `px-1.5` plus each cell's `px-1.5` makes the side
 * gutter match the gap between columns. Rows break out of that pad so
 * hover and footer fills reach the card edge.
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
        className="grid w-full min-w-0 px-1.5 text-sm"
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
        "col-span-full -mx-1.5 box-border grid min-h-[2.75rem] w-full grid-cols-subgrid items-center justify-items-stretch px-1.5",
        footer ? "bg-well/60" : "border-b border-border/50",
        className
      )}
    >
      {children}
    </div>
  );
}

export const cellBase =
  "flex min-w-0 w-full items-center justify-center whitespace-nowrap px-1.5 py-2 text-center";

/** Same metrics as cellBase. First/last columns stay centered like the rest. */
export const cellTicker = cellBase;
export const cellLast = cellBase;

export const htmlTable = "w-full table-fixed border-collapse text-sm";
export const htmlCell =
  "px-1.5 py-2 text-center align-middle first:pl-3 last:pr-3";
export const htmlCellFirst = htmlCell;
export const htmlCellLast = htmlCell;
