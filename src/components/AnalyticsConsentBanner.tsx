"use client";

import { Button } from "@/components/ui/button";
import {
  ANALYTICS_CONSENT_EVENT,
  loadAnalyticsConsent,
  saveAnalyticsConsent,
} from "@/lib/analytics-consent";
import { useEffect, useState } from "react";

/**
 * Essential sign-in cookies always run. This only asks about Vercel
 * page-view and load-time measurement.
 */
export function AnalyticsConsentBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => setOpen(loadAnalyticsConsent() == null);
    sync();
    window.addEventListener(ANALYTICS_CONSENT_EVENT, sync);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, sync);
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Performance measurement"
      className="fixed z-50 left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(0.75rem,calc(var(--dock-pad,5.5rem)+0.5rem))] md:left-auto md:w-[22rem]"
    >
      <div className="flex flex-col gap-3 rounded-xl glass ring-1 ring-foreground/18 p-4">
        <p className="text-sm leading-relaxed text-foreground">
          Page views and load times help keep the app fast. Sign-in cookies
          always run. Performance measurement is optional.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => saveAnalyticsConsent("allow")}
          >
            Allow
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => saveAnalyticsConsent("deny")}
          >
            No thanks
          </Button>
        </div>
      </div>
    </div>
  );
}
