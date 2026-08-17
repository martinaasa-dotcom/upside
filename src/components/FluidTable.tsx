import { cn } from "@/lib/format";
import type { ReactNode } from "react";

/**
 * Full-width CSS grid. Columns share leftover width so the last track
 * sits on the right edge of the card, not floating in empty space.
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
        className="grid w-full min-w-0 text-sm"
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

/** Ticker column: cashtag + listing chip, right-aligned toward the numbers. */
export const cellTicker =
  "flex min-w-0 w-full items-center justify-end whitespace-nowrap py-2 pl-3 pr-1.5 text-right";

/** Last data column: keep the figure on the card's right edge. */
export const cellLast =
  "flex min-w-0 w-full items-center justify-end whitespace-nowrap py-2 pl-1.5 pr-3 text-right";
