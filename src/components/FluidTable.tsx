import { cn } from "@/lib/format";
import type { ReactNode } from "react";

/**
 * Full-width CSS grid. Side padding is the safety gutter so cashtags
 * and last-column figures never run into the card border.
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
        className="grid w-full min-w-0 px-3 text-sm"
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
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "col-span-full box-border grid min-h-[2.75rem] w-full grid-cols-subgrid items-center justify-items-stretch border-b border-border/50",
        className
      )}
    >
      {children}
    </div>
  );
}

export const cellBase =
  "flex min-w-0 w-full items-center justify-center whitespace-nowrap px-1.5 py-2 text-center";

/** Ticker column: sit on the padded left edge, never clip the cashtag. */
export const cellTicker =
  "flex w-full min-w-max items-center justify-start whitespace-nowrap py-2 pr-2 text-left";

/** Last data column: right-aligned, table px-3 is the right gutter. */
export const cellLast =
  "flex min-w-0 w-full items-center justify-end whitespace-nowrap py-2 pl-1.5 text-right";
