"use client";

import { useOnlineStatus } from "@/lib/use-online-status";

/**
 * Overlay chip when the device has no network. Does not sit in the header
 * or push the page down; the last cached book stays on screen.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed z-50 left-[max(0.75rem,env(safe-area-inset-left))] bottom-[max(0.75rem,calc(var(--dock-pad,5.5rem)+0.5rem))]"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-caution/40 bg-background/90 px-2.5 py-1 text-sm font-medium text-caution shadow-lg backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-caution" aria-hidden />
        Offline Mode
      </span>
    </div>
  );
}
