"use client";

import { cn } from "@/lib/format";
import {
  isEditableField,
  keepFocusedFieldVisible,
  useOverlayScrollLock,
} from "@/lib/use-visual-viewport";
import type { CSSProperties, FocusEvent, ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

function scrollFocusedField(e: FocusEvent<HTMLDivElement>) {
  if (!isEditableField(e.target)) return;
  requestAnimationFrame(() => keepFocusedFieldVisible(e.target));
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
