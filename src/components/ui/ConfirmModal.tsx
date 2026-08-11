"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** When set, show a PIN field and pass the value to onConfirm. */
  requirePin?: boolean;
  pinLabel?: string;
  /** Prefill PIN (e.g. session unlock). */
  initialPin?: string;
  /**
   * Return false (or Promise resolving to false) to keep the dialog open
   * after a failed confirm (e.g. invalid PIN).
   */
  onConfirm: (pin?: string) => void | boolean | Promise<void | boolean>;
  onClose: () => void;
};

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  requirePin = false,
  pinLabel = "Owner PIN",
  initialPin = "",
  onConfirm,
  onClose,
}: Props) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPin("");
      setBusy(false);
      setError(null);
      return;
    }
    setPin(initialPin);
    setError(null);
  }, [open, initialPin]);

  if (!open) return null;

  async function runConfirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onConfirm(requirePin ? pin : undefined);
      if (result === false) {
        setError(requirePin ? "Invalid PIN or action failed" : "Action failed");
        return;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
        disabled={busy}
      />
      <div className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm leading-relaxed text-zinc-400">{body}</p>
        {requirePin && (
          <label className="mt-4 block text-xs font-medium text-zinc-400">
            {pinLabel}
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runConfirm();
              }}
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
              placeholder="••••••"
              autoFocus
              disabled={busy}
            />
          </label>
        )}
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void runConfirm()}
            disabled={busy || (requirePin && !pin.trim())}
            className={
              destructive
                ? "rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400 disabled:opacity-40"
                : "rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-[#121214] hover:bg-brand-bright disabled:opacity-40"
            }
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
