"use client";

import { useEffect } from "react";

/** Layout-viewport fallback so the first paint matches today's full screen. */
function applyVisualViewportVars() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  root.style.setProperty("--vv-top", `${vv?.offsetTop ?? 0}px`);
  root.style.setProperty("--vv-left", `${vv?.offsetLeft ?? 0}px`);
  root.style.setProperty("--vv-width", `${vv?.width ?? window.innerWidth}px`);
  root.style.setProperty("--vv-height", `${vv?.height ?? window.innerHeight}px`);
}

/**
 * Keeps `--vv-*` in sync with the visible screen. On phones the virtual
 * keyboard shrinks that box; overlays that pin to these vars sit above the
 * keys instead of under them. The page chrome stays on the layout viewport
 * so the top bar does not hop.
 */
export function useVisualViewportVars() {
  useEffect(() => {
    applyVisualViewportVars();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", applyVisualViewportVars);
    vv?.addEventListener("scroll", applyVisualViewportVars);
    window.addEventListener("resize", applyVisualViewportVars);
    return () => {
      vv?.removeEventListener("resize", applyVisualViewportVars);
      vv?.removeEventListener("scroll", applyVisualViewportVars);
      window.removeEventListener("resize", applyVisualViewportVars);
    };
  }, []);
}

let overlayLockCount = 0;

/** Stops the page behind a sheet from scrolling when the keyboard opens. */
export function useOverlayScrollLock() {
  useEffect(() => {
    overlayLockCount += 1;
    if (overlayLockCount === 1) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      overlayLockCount -= 1;
      if (overlayLockCount <= 0) {
        overlayLockCount = 0;
        document.body.style.overflow = "";
      }
    };
  }, []);
}
