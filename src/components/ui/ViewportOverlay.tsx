"use client";

import { cn } from "@/lib/format";
import { useOverlayScrollLock } from "@/lib/use-visual-viewport";
import type { CSSProperties, FocusEvent, ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

function scrollFocusedField(e: FocusEvent<HTMLDivElement>) {
  const el = e.target;
  if (!(el instanceof HTMLElement)) return;
  if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA" && el.tagName !== "SELECT") {
    return;
  }
  requestAnimationFrame(() => {
    el.scrollIntoView({ block: "center", inline: "nearest" });
  });
}

/**
 * Full-screen dimmer that tracks the visible viewport. Bottom sheets and
 * centered dialogs stay above the virtual keyboard; the app header does not
 * move with it.
 */
export function ViewportOverlay({ children, className, style }: Props) {
  useOverlayScrollLock();
  return (
    <div
      className={cn("viewport-overlay fixed overflow-x-hidden", className)}
      style={{
        top: "var(--vv-top, 0px)",
        left: "var(--vv-left, 0px)",
        width: "var(--vv-width, 100%)",
        height: "var(--vv-height, 100%)",
        ...style,
      }}
      onFocusCapture={scrollFocusedField}
    >
      {children}
    </div>
  );
}
