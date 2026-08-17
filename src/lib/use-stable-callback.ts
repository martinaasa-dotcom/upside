"use client";

import { useCallback, useRef } from "react";

/**
 * Event-handler identity that never changes, with a closure that is
 * always current. Pass these into memo'd tables/charts so a parent
 * tick (quote age, poll) does not rebuild the whole tree.
 */
export function useStableCallback<Args extends unknown[], R>(
  fn: (...args: Args) => R
): (...args: Args) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: Args) => ref.current(...args), []);
}
