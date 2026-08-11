"use client";

import {
  getSessionPin,
  OWNER_PIN_HEADER,
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
  hasSheetSecret: boolean;
  onClose: () => void;
  onChanged: (hasSecret: boolean) => void;
};

export function SheetSecretModal({
  open,
  portfolioId,
  portfolioName,
  hasSheetSecret,
  onClose,
  onChanged,
}: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCurrent(getSessionPin());
    setNext("");
    setConfirm("");
    setError(null);
    setNote(null);
    setBusy(false);
  }, [open, portfolioId]);

  if (!open) return null;

  async function save(clear = false) {
    const auth = current.trim() || getSessionPin();
    if (hasSheetSecret && !auth) {
      setError("Enter this sheet’s current PIN/password");
      return;
    }
    if (!clear) {
      if (next.trim().length < 4) {
        setError("New PIN/password must be at least 4 characters");
        return;
      }
      if (next.trim() !== confirm.trim()) {
        setError("New PIN/password confirmation does not match");
        return;
      }
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        [OWNER_PORTFOLIO_HEADER]: portfolioId,
      };
      if (auth) headers[OWNER_PIN_HEADER] = auth;
      const res = await fetch("/api/owner/sheet-secret", {
        method: "POST",
        headers,
        body: JSON.stringify(
          clear
            ? { portfolioId, clear: true }
            : { portfolioId, secret: next.trim() }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to update"
        );
      }
      const saved = clear ? "" : next.trim();
      if (saved) {
        setSessionPin(saved);
        markSheetSessionUnlocked(portfolioId, saved);
      }
      onChanged(Boolean(data.hasAccessSecret));
      setNote(
        clear
          ? "Sheet is unlocked — anyone with the link can edit."
          : data.note || "Sheet PIN/password saved."
      );
      if (!clear) {
        setNext("");
        setConfirm("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
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
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <KeyRound className="h-4 w-4 text-brand" />
            Sheet lock · {portfolioName}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-3.5 text-zinc-400 hover:bg-zinc-800 hover:text-white sm:p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-zinc-400">
          {hasSheetSecret
            ? "Custom sheet secret active — required to edit this sheet."
            : "Sheet is open. Set a PIN/password only if you want it locked."}
        </p>

        {hasSheetSecret && (
          <label className="mt-4 block text-xs font-medium text-zinc-400">
            Current PIN / password
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
            />
          </label>
        )}

        <label className="mt-3 block text-xs font-medium text-zinc-400">
          New PIN / password
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
            placeholder="At least 4 characters"
          />
        </label>
        <label className="mt-3 block text-xs font-medium text-zinc-400">
          Confirm new
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
          />
        </label>

        {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
        {note && <p className="mt-2 text-sm text-emerald-400">{note}</p>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {hasSheetSecret && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save(true)}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500 disabled:opacity-40"
            >
              Remove lock
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void save(false)}
            disabled={busy}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-[#121214] hover:bg-brand-bright disabled:opacity-40"
          >
            {busy ? "…" : hasSheetSecret ? "Update lock" : "Lock sheet"}
          </button>
        </div>
      </div>
    </div>
  );
}
