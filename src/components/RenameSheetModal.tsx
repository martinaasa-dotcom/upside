"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (!open) return;
    setName(initialName);
  }, [open, initialName]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="relative w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-3.5 text-zinc-400 hover:bg-zinc-800 hover:text-white sm:p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="grid gap-1 text-xs text-zinc-400">
          {label}
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
            required
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-[#121214] hover:bg-brand-bright"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
