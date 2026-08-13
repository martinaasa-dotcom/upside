"use client";

import { cn } from "@/lib/format";

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
  const stale = delayed || (ageMin != null && ageMin >= 15);
  if (!stale && missingTickers.length === 0) return null;

  return (
    <div
      className={cn(
        "border-b px-4 py-2 text-xs",
        stale
          ? "border-amber-500/30 bg-amber-950/40 text-amber-100"
          : "border-zinc-800 bg-zinc-900/80 text-zinc-400"
      )}
    >
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-1">
        {stale && (
          <span>
            Quotes may be stale
            {ageMin != null ? ` (${ageMin}m since last refresh)` : ""}
            {delayed ? " · provider delayed flag" : ""}.
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
