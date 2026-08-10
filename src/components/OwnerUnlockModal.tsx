"use client";

import { OWNER_PIN_HEADER, setSessionPin } from "@/lib/owner-pin-client";
import { Lock, X } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called with the verified PIN (also stored in sessionStorage). */
  onUnlocked: (pin: string) => void;
};

export function OwnerUnlockModal({ open, onClose, onUnlocked }: Props) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPin("");
      setBusy(false);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  async function unlock() {
    const value = pin.trim();
    if (!value) {
      setError("Enter owner PIN");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/owner/verify", {
        method: "POST",
        headers: { [OWNER_PIN_HEADER]: value },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Invalid owner PIN"
        );
      }
      setSessionPin(value);
      onUnlocked(value);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <Lock className="h-4 w-4 text-brand" />
            Unlock edits
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-zinc-400">
          Shared book writes need the owner PIN. It stays in this tab’s session
          until you close the tab.
        </p>
        <label className="mt-4 block text-xs font-medium text-zinc-400">
          Owner PIN
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void unlock();
            }}
            className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
            placeholder="••••••"
          />
        </label>
        {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void unlock()}
            disabled={busy || !pin.trim()}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-[#121214] hover:bg-brand-bright disabled:opacity-40"
          >
            {busy ? "…" : "Unlock"}
          </button>
        </div>
      </div>
    </div>
  );
}
