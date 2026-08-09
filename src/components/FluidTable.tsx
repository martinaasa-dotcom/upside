import { cn } from "@/lib/format";
import type { ReactNode } from "react";

/**
 * Full-width grid: each column ≥ content, leftover width shared evenly.
 * Cell content is centered so surplus space looks balanced (not piled
 * between left-aligned and right-aligned neighbors).
 */
export function FluidTable({
  template,
  children,
}: {
  template: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
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
        "col-span-full grid grid-cols-subgrid items-center justify-items-center border-b border-zinc-800/50",
        className
      )}
    >
      {children}
    </div>
  );
}

export const cellBase =
  "flex min-w-0 w-full items-center justify-center whitespace-nowrap px-2 py-2 text-center";
