"use client";

import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /**
   * Return false (or Promise resolving to false) to keep the dialog open
   * after a failed confirm.
   */
  onConfirm: () => void | boolean | Promise<void | boolean>;
  onClose: () => void;
};

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onClose,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!open) {
      busyRef.current = false;
      setBusy(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busyRef.current) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function runConfirm() {
    if (busy) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await onConfirm();
      if (result === false) {
        setError("That didn't work. Try again.");
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <ViewportOverlay className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
        disabled={busy}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative max-h-full w-full overflow-y-auto rounded-t-2xl border border-border bg-well p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-2xl sm:pb-5"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 id="confirm-title" className="text-base font-semibold text-foreground">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            title="Close"
            className="rounded-lg p-3.5 text-muted hover:bg-hover hover:text-foreground disabled:opacity-40 sm:p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm leading-relaxed text-muted">{body}</p>
        {error && <p className="mt-3 text-sm text-loss">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="touch-target rounded-lg px-3 py-2 text-sm text-muted hover:bg-well hover:text-foreground disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void runConfirm()}
            disabled={busy}
            className={
              destructive
                ? "rounded-lg bg-loss px-4 py-2 text-sm font-semibold text-paper hover:bg-loss/80 disabled:opacity-40"
                : "btn-primary disabled:opacity-40"
            }
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </ViewportOverlay>
  );
}
