"use client";

import { useEffect } from "react";

const KEYBOARD_INSET_PX = 80;
const FIELD_PAD_PX = 16;
const KEEP_VISIBLE_DELAYS_MS = [80, 240, 480];

const SKIP_INPUT_TYPES = new Set([
  "button",
  "submit",
  "reset",
  "checkbox",
  "radio",
  "file",
  "hidden",
  "range",
  "color",
  "image",
]);

export function isEditableField(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLInputElement) return !SKIP_INPUT_TYPES.has(el.type);
  return (
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    el.isContentEditable
  );
}

function keyboardInsetPx(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
}

function keyboardLooksOpen(): boolean {
  const inset = keyboardInsetPx();
  if (inset >= KEYBOARD_INSET_PX) return true;
  if (!isEditableField(document.activeElement)) return false;
  const vv = window.visualViewport;
  const visible = vv?.height ?? window.innerHeight;
  return visible < window.screen.height * 0.72;
}

function bottomReservePx(): number {
  return keyboardLooksOpen() ? FIELD_PAD_PX : 11 * 16;
}

function fieldIsVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const vv = window.visualViewport;
  const top = vv?.offsetTop ?? 0;
  const height = vv?.height ?? window.innerHeight;
  const bottom = top + height;
  const reserve = bottomReservePx();
  const visualOk =
    rect.top >= FIELD_PAD_PX && rect.bottom <= height - reserve;
  const layoutOk =
    rect.top >= top + FIELD_PAD_PX && rect.bottom <= bottom - reserve;
  return visualOk || layoutOk;
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    const oy = getComputedStyle(parent).overflowY;
    if (
      (oy === "auto" || oy === "scroll" || oy === "overlay") &&
      parent.scrollHeight > parent.clientHeight + 1
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

/** Keep the focused field inside the visible screen, above the keys. */
export function keepFocusedFieldVisible(el?: HTMLElement | null) {
  const field = el ?? (isEditableField(document.activeElement) ? document.activeElement : null);
  if (!field) return;
  if (fieldIsVisible(field)) return;

  const parent = scrollParent(field);
  if (parent) {
    field.scrollIntoView({ block: "center", inline: "nearest" });
  } else {
    field.scrollIntoView({ block: "center", inline: "nearest" });
  }

  requestAnimationFrame(() => {
    if (fieldIsVisible(field)) return;
    const rect = field.getBoundingClientRect();
    const vv = window.visualViewport;
    const top = vv?.offsetTop ?? 0;
    const bottom = top + (vv?.height ?? window.innerHeight);
    const reserve = bottomReservePx();
    const delta =
      rect.bottom > bottom - reserve
        ? rect.bottom - (bottom - reserve)
        : rect.top - (top + FIELD_PAD_PX);
    if (parent) parent.scrollTop += delta;
    else window.scrollBy(0, delta);
  });
}

function applyVisualViewportVars() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const inset = keyboardInsetPx();
  root.style.setProperty("--vv-top", `${vv?.offsetTop ?? 0}px`);
  root.style.setProperty("--vv-left", `${vv?.offsetLeft ?? 0}px`);
  root.style.setProperty("--vv-width", `${vv?.width ?? window.innerWidth}px`);
  root.style.setProperty("--vv-height", `${vv?.height ?? window.innerHeight}px`);
  root.style.setProperty("--vv-keyboard", `${inset}px`);
  if (keyboardLooksOpen()) root.dataset.keyboard = "open";
  else delete root.dataset.keyboard;
  keepFocusedFieldVisible();
}

/**
 * Keeps `--vv-*` in sync with the visible screen and scrolls any focused
 * field above the virtual keyboard. Overlays pin to these vars. Bottom
 * docks hide while typing so they cannot sit on the field.
 */
export function useVisualViewportVars() {
  useEffect(() => {
    applyVisualViewportVars();
    const vv = window.visualViewport;
    let keepTimers: number[] = [];

    function clearKeep() {
      for (const id of keepTimers) window.clearTimeout(id);
      keepTimers = [];
    }

    function onFocusIn(e: FocusEvent) {
      if (!isEditableField(e.target)) return;
      applyVisualViewportVars();
      keepFocusedFieldVisible(e.target);
      clearKeep();
      for (const ms of KEEP_VISIBLE_DELAYS_MS) {
        keepTimers.push(
          window.setTimeout(() => keepFocusedFieldVisible(e.target as HTMLElement), ms)
        );
      }
    }

    function onFocusOut() {
      window.setTimeout(applyVisualViewportVars, 80);
    }

    vv?.addEventListener("resize", applyVisualViewportVars);
    vv?.addEventListener("scroll", applyVisualViewportVars);
    window.addEventListener("resize", applyVisualViewportVars);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      vv?.removeEventListener("resize", applyVisualViewportVars);
      vv?.removeEventListener("scroll", applyVisualViewportVars);
      window.removeEventListener("resize", applyVisualViewportVars);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      clearKeep();
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
