"use client";

import { MacroStrip } from "@/components/MacroStrip";
import { cn } from "@/lib/format";
import { PAGE_COLUMN_CLASS } from "@/lib/page-shell";
import { loadCachedQuotes } from "@/lib/quote-cache";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { useEffect, useState } from "react";

export type AppStatusProps = {
  quotesUpdatedAt?: number | null;
  quotesDelayed?: boolean;
  quotedCount?: number;
  totalCount?: number;
};

function formatAge(sec: number): string {
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

/** One locked row under the header. Same height on every room. */
export function AppStatusStrip({
  quotesUpdatedAt,
  quotesDelayed = false,
  quotedCount,
  totalCount,
}: AppStatusProps) {
  const [cachedAt] = useHydratedCache(
    () => loadCachedQuotes().savedAt,
    null as number | null
  );
  const updatedAt = quotesUpdatedAt ?? cachedAt;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    const onVis = () => setNow(Date.now());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const sec =
    updatedAt == null
      ? null
      : Math.max(0, Math.floor((now - updatedAt) / 1000));

  return (
    <div className="border-b border-border">
      <div className={cn(PAGE_COLUMN_CLASS, "flex h-10 items-center gap-3")}>
        <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-muted">
          {sec == null ? "Prices · —" : `Prices · ${formatAge(sec)}`}
          {quotedCount != null && totalCount != null ? (
            <span className="hidden sm:inline">
              {` · ${quotedCount}/${totalCount} names`}
            </span>
          ) : null}
          {quotesDelayed && sec != null && sec >= 30 * 60 ? " · delayed" : ""}
        </span>
        <MacroStrip />
      </div>
    </div>
  );
}
