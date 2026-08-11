"use client";

import { OWNER_PIN_HEADER, OWNER_PORTFOLIO_HEADER, setSessionPin, markSheetSessionUnlocked } from "@/lib/owner-pin-client";
import { Lock, X } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onUnlocked: (pin: string) => void;
  portfolioId?: string | null;
  portfolioName?: string | null;
  hasSheetSecret?: boolean;
};

export function OwnerUnlockModal({
  open,
  onClose,
  onUnlocked,
  portfolioId,
  portfolioName,
  hasSheetSecret,
}: Props) {
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
      setError("Enter this sheet’s PIN or password");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const headers: Record<string, string> = {
        [OWNER_PIN_HEADER]: value,
        "Content-Type": "application/json",
      };
      if (portfolioId) headers[OWNER_PORTFOLIO_HEADER] = portfolioId;
      const res = await fetch("/api/owner/verify", {
        method: "POST",
        headers,
        body: JSON.stringify({ portfolioId: portfolioId || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Invalid PIN or password"
        );
      }
      setSessionPin(value);
      if (portfolioId) markSheetSessionUnlocked(portfolioId, value);
      onUnlocked(value);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed");
    } finally {
      setBusy(false);
    }
  }

  const sheetLabel = portfolioName?.trim() || "this sheet";

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
            Unlock {sheetLabel}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-3.5 text-zinc-400 hover:bg-zinc-800 hover:text-white sm:p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2 text-sm text-zinc-400">
          <p>
            This sheet is password-protected. Enter its{" "}
            <span className="text-zinc-200">PIN or password</span> to edit.
          </p>
          {!hasSheetSecret && (
            <p className="text-xs text-amber-200/80">
              This sheet isn’t marked locked — if unlock keeps failing, refresh
              the page.
            </p>
          )}
          <p className="text-xs text-zinc-500">
            Stays unlocked in this browser tab until you close it.
          </p>
        </div>
        <label className="mt-4 block text-xs font-medium text-zinc-400">
          PIN or password
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void unlock();
            }}
            className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
            placeholder="PIN or password"
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
