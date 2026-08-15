"use client";

import { useEffect, useRef } from "react";

/**
 * Re-run a load after the device comes back. `online` covers wifi/sleep.
 * `pageshow` with persisted covers Safari/Chrome back-forward cache, where
 * the page wakes up with aborted fetches and no `online` event.
 *
 * Does not fire on the first load. Mount effects already do that.
 */
export function useNetworkResume(onResume: () => void) {
  const onResumeRef = useRef(onResume);
  onResumeRef.current = onResume;

  useEffect(() => {
    const onOnline = () => onResumeRef.current();
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) onResumeRef.current();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
}
