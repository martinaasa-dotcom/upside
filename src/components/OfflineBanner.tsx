"use client";

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
      className="border-b border-amber-500/25 bg-amber-950/50 px-4 py-2 text-xs text-amber-100"
    >
      <div className="mx-auto max-w-[1400px]">
        You&apos;re offline. Showing the last saved book.
      </div>
    </div>
  );
}
