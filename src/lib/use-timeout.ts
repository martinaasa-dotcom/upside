"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * setTimeout that cannot fire after unmount. Flash-then-clear UI
 * (saved, copied) used to leave a timer that called setState on a
 * dead tree if you left the page first.
 */
export function useTimeout() {
  const ids = useRef(new Set<number>());

  useEffect(
    () => () => {
      for (const id of ids.current) window.clearTimeout(id);
      ids.current.clear();
    },
    []
  );

  return useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      ids.current.delete(id);
      fn();
    }, ms);
    ids.current.add(id);
    return id;
  }, []);
}
