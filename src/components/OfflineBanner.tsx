"use client";

import { PAGE_COLUMN_CLASS } from "@/lib/page-shell";
import { useOnlineStatus } from "@/lib/use-online-status";

/**
 * Subtle status when the device has no network. The book still shows
 * whatever was last cached. Hidden while online so it never nags.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className="border-b border-amber-500/25 bg-amber-950/50 py-2 text-xs text-amber-100"
    >
      <div className={PAGE_COLUMN_CLASS}>
        You&apos;re offline. Showing what we last had.
      </div>
    </div>
  );
}
