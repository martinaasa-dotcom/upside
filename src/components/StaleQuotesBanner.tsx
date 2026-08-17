"use client";

import { cn } from "@/lib/format";
import { PAGE_COLUMN_CLASS } from "@/lib/page-shell";

type Props = {
  delayed?: boolean;
  updatedAt: number | null;
  missingTickers?: string[];
};

/** Honesty banner when quotes are old or a name has no live mark. */
export function StaleQuotesBanner({
  delayed,
  updatedAt,
  missingTickers = [],
}: Props) {
  const ageMin =
    updatedAt != null
      ? Math.floor((Date.now() - updatedAt) / 60000)
      : null;
  const stale = ageMin != null && ageMin >= 30;
  if (!stale && missingTickers.length === 0) return null;

  return (
    <div
      className={cn(
        "border-b py-2 text-sm",
        stale
          ? "border-caution/40 bg-caution/10 text-caution"
          : "border-border bg-well/80 text-muted-foreground"
      )}
    >
      <div className={cn(PAGE_COLUMN_CLASS, "flex flex-wrap items-center gap-x-3 gap-y-1")}>
        {stale && (
          <span>
            Quotes may be stale
            {ageMin != null ? ` (${ageMin}m since last refresh)` : ""}
            {delayed && ageMin != null && ageMin >= 30
              ? " · provider delayed flag"
              : ""}
            .
          </span>
        )}
        {missingTickers.length > 0 && (
          <span>
            No live quote for {missingTickers.slice(0, 8).join(", ")}
            {missingTickers.length > 8
              ? ` +${missingTickers.length - 8}`
              : ""}
            . Showing the last known price.
          </span>
        )}
      </div>
    </div>
  );
}
