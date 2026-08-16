import { cn } from "@/lib/format";
import type { ReactNode } from "react";

/**
 * Chart ticks live in HTML at text-xs. SVG <text> scales with the
 * viewBox, so a 11px label on a 640-wide chart becomes ~22px on a
 * laptop. GoldNav, Forecast, Compound, and Margus vs SPY all use this.
 */
export function ChartYAxis({
  ticks,
  yAt,
  height,
  format,
  className,
}: {
  ticks: number[];
  yAt: (v: number) => number;
  height: number;
  format: (v: number) => string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-12 shrink-0", className)}>
      {ticks.map((t) => (
        <span
          key={t}
          className="absolute right-0 -translate-y-1/2 text-xs tabular-nums text-muted"
          style={{ top: `${(yAt(t) / height) * 100}%` }}
        >
          {format(t)}
        </span>
      ))}
    </div>
  );
}

export function ChartXRail({
  children,
  className,
  railClassName,
}: {
  children: ReactNode;
  className?: string;
  railClassName?: string;
}) {
  return (
    <div className={cn("mt-1.5 flex", className)}>
      <div className={cn("w-12 shrink-0", railClassName)} />
      <div className="relative h-4 min-w-0 flex-1 text-xs text-muted">
        {children}
      </div>
    </div>
  );
}
