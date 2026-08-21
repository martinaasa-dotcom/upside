"use client";

import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { circleHref, lastCircleEventName } from "@/lib/workspace-rooms";
import { useEffect } from "react";

/**
 * Where Circle goes: the room you were last in, else the list.
 *
 * The dock cell that used this lives in `BookModeDock` now, drawn from the
 * same cell template as every other destination — a separate component
 * could not stay in step with it by hand.
 */
export function useCircleHref(): string {
  const [href, setHref] = useHydratedCache(circleHref, "/communities");
  useEffect(() => {
    const sync = () => setHref(circleHref());
    window.addEventListener(lastCircleEventName(), sync);
    return () => window.removeEventListener(lastCircleEventName(), sync);
  }, [setHref]);
  return href;
}
