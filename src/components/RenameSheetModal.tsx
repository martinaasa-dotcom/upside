"use client";

import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { sanitizeSheetName } from "@/lib/input-guard";

type Props = {
  open: boolean;
  initialName: string;
  onClose: () => void;
  onSave: (name: string) => void;
  /** Defaults to the rename-sheet wording so existing callers are unaffected. */
  title?: string;
  label?: string;
  placeholder?: string;
  confirmLabel?: string;
};

/**
 * Generic "name this thing" modal — used for both renaming an existing
 * sheet and creating a new one, so the zero-sheets empty state doesn't need
 * to fall back to a native window.prompt() (which looked broken next to
 * every other themed modal in the app).
 */
export function RenameSheetModal({
  open,
  initialName,
  onClose,
  onSave,
  title = "Rename portfolio",
  label = "Name",
  placeholder,
  confirmLabel = "Save",
}: Props) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setBusy(false);
  }, [open, initialName]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = sanitizeSheetName(name);
    if (!trimmed) return;
    setBusy(true);
    onSave(trimmed);
  }

  return (
    <ViewportOverlay className="z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="relative max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-well p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-3.5 text-muted-foreground hover:bg-hover hover:text-foreground sm:p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="grid gap-1 text-sm text-muted-foreground">
          {label}
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 80))}
            maxLength={80}
            placeholder={placeholder}
            className="rounded-lg border border-border bg-well px-3 py-2 text-sm text-foreground outline-none focus:border-brand"
            required
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-well hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !sanitizeSheetName(name)}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </form>
    </ViewportOverlay>
  );
}
