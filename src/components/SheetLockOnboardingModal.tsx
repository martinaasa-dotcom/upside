"use client";

import {
  OWNER_PORTFOLIO_HEADER,
  markSheetSessionUnlocked,
  setSessionPin,
} from "@/lib/owner-pin-client";
import { KeyRound, X } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  portfolioId: string;
  portfolioName: string;
  onSkip: () => void;
  onLocked: () => void;
};

/** Shown right after creating a sheet — optional first lock. */
export function SheetLockOnboardingModal({
  open,
  portfolioId,
  portfolioName,
  onSkip,
  onLocked,
}: Props) {
  const [wantLock, setWantLock] = useState(false);
  const [secret, setSecret] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setWantLock(false);
    setSecret("");
    setConfirm("");
    setBusy(false);
    setError(null);
  }, [open, portfolioId]);

  if (!open) return null;

  async function lockSheet() {
    if (secret.trim().length < 4) {
      setError("PIN/password must be at least 4 characters");
      return;
    }
    if (secret.trim() !== confirm.trim()) {
      setError("Confirmation does not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/owner/sheet-secret", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [OWNER_PORTFOLIO_HEADER]: portfolioId,
        },
        body: JSON.stringify({ portfolioId, secret: secret.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to lock sheet"
        );
      }
      setSessionPin(secret.trim());
      markSheetSessionUnlocked(portfolioId, secret.trim());
      onLocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to lock sheet");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <KeyRound className="h-4 w-4 text-brand" />
            Protect {portfolioName}?
          </h3>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-lg p-3.5 text-zinc-400 hover:bg-zinc-800 hover:text-white sm:p-1.5"
            aria-label="Skip"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-zinc-400">
          Sheets are open by default. Lock this one with a PIN or password if
          only you should edit it.
        </p>

        {!wantLock ? (
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500"
            >
              Keep open
            </button>
            <button
              type="button"
              onClick={() => setWantLock(true)}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-[#121214] hover:bg-brand-bright"
            >
              Lock with PIN / password
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-xs font-medium text-zinc-400">
              PIN or password
              <input
                type="password"
                autoComplete="new-password"
                autoFocus
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
                placeholder="At least 4 characters"
              />
            </label>
            <label className="block text-xs font-medium text-zinc-400">
              Confirm
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void lockSheet();
                }}
                className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
              />
            </label>
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onSkip}
                className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-white"
              >
                Skip — leave open
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void lockSheet()}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-[#121214] hover:bg-brand-bright disabled:opacity-40"
              >
                {busy ? "…" : "Lock sheet"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
