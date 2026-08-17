"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * Write the visible dock's real height into --dock-pad so page padding
 * always clears it. Guessing in rem broke every time the dock grew.
 */
export function useDockPad(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const apply = () => {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return;
      const height = el.getBoundingClientRect().height;
      if (height < 16) return;
      const pad = `${Math.ceil(height + 32)}px`;
      document.documentElement.style.setProperty("--dock-pad", pad);
      document.querySelectorAll(".page-frame").forEach((frame) => {
        if (frame instanceof HTMLElement) {
          frame.style.setProperty("--dock-pad", pad);
        }
      });
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, [ref]);
}
