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
      className="border-b border-caution/35 bg-caution/15 py-2 text-sm text-caution"
    >
      <div className={PAGE_COLUMN_CLASS}>
        You&apos;re offline. Showing what we last had.
      </div>
    </div>
  );
}
