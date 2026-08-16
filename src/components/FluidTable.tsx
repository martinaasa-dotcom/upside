import { cn } from "@/lib/format";
import type { ReactNode } from "react";

/**
 * Full-width CSS grid. Pass a template: `minmax(max-content, 1fr)` keeps
 * each column at least as wide as its content (scrolls if needed);
 * `minmax(0, 1fr)` shrinks to the container. Cell content is centered
 * so leftover space looks balanced.
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
        "overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]",
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
        "col-span-full box-border grid min-h-[2.75rem] grid-cols-subgrid items-center justify-items-center border-b border-border/50",
        className
      )}
    >
      {children}
    </div>
  );
}

export const cellBase =
  "flex min-w-0 w-full items-center justify-center whitespace-nowrap px-1 py-2 text-center";
