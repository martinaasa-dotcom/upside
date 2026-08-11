"use client";

import {
  getSessionPin,
  OWNER_PIN_HEADER,
} from "@/lib/owner-pin-client";
import { History, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type SnapMeta = {
  id: string;
  kind: string;
  label: string;
  created_at: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onRestored: (mode: "book" | "sheet") => void;
  activePortfolioId?: string | null;
  activePortfolioName?: string | null;
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function SnapshotsModal({
  open,
  onClose,
  onRestored,
  activePortfolioId,
  activePortfolioName,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<SnapMeta[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pin = getSessionPin();
      const headers: Record<string, string> = {};
      if (pin) headers[OWNER_PIN_HEADER] = pin;
      const res = await fetch("/api/snapshots", { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load snapshots");
      setSnapshots(data.snapshots ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSnapshots([]);
      setBusyId(null);
      return;
    }
    void load();
  }, [open, load]);

  async function restoreBook(id: string, label: string) {
    if (
      !window.confirm(
        `Restore full book “${label}”? This replaces every sheet. A safety snapshot is taken first.`
      )
    ) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const pin = getSessionPin();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (pin) headers[OWNER_PIN_HEADER] = pin;
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "restore", id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Restore failed");
      onRestored("book");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusyId(null);
    }
  }

  async function restoreSheet(id: string, label: string) {
    if (!activePortfolioId) return;
    if (
      !window.confirm(
        `Restore “${label}” into ${activePortfolioName ?? "this sheet"} only?`
      )
    ) {
      return;
    }
    setBusyId(`${id}:sheet`);
    setError(null);
    try {
      const pin = getSessionPin();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (pin) headers[OWNER_PIN_HEADER] = pin;
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "restore_sheet",
          id,
          portfolioId: activePortfolioId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Sheet restore failed");
      onRestored("sheet");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sheet restore failed");
    } finally {
      setBusyId(null);
    }
  }

  async function createManual() {
    setLoading(true);
    setError(null);
    try {
      const pin = getSessionPin();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (pin) headers[OWNER_PIN_HEADER] = pin;
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "create", label: "Manual snapshot" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Snapshot failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Snapshot failed");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-white">
              <History className="h-4 w-4 text-brand" />
              Snapshots
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Nightly backups + pre-delete safety copies. Prefer sheet restore
              when you only need one portfolio.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-3.5 text-zinc-400 hover:bg-zinc-800 hover:text-white sm:p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-500">
                {snapshots.length} snapshot
                {snapshots.length === 1 ? "" : "s"}
              </p>
              <button
                type="button"
                onClick={() => void createManual()}
                disabled={loading}
                className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50"
              >
                Snapshot now
              </button>
            </div>
            {error && <p className="text-sm text-rose-400">{error}</p>}
            {loading && snapshots.length === 0 ? (
              <p className="flex items-center justify-center gap-2 py-6 text-sm text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </p>
            ) : snapshots.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-500">
                No snapshots yet. Nightly runs at 02:00 UTC, or tap Snapshot
                now.
              </p>
            ) : (
              <ul className="space-y-2">
                {snapshots.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {s.label || s.kind}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {s.kind} · {formatWhen(s.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {activePortfolioId && (
                        <button
                          type="button"
                          disabled={busyId != null}
                          onClick={() =>
                            void restoreSheet(s.id, s.label || s.kind)
                          }
                          className="rounded-md border border-zinc-600 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:border-zinc-400 disabled:opacity-50"
                        >
                          {busyId === `${s.id}:sheet`
                            ? "…"
                            : `Sheet${activePortfolioName ? ` · ${activePortfolioName}` : ""}`}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId != null}
                        onClick={() =>
                          void restoreBook(s.id, s.label || s.kind)
                        }
                        className="rounded-md bg-brand/15 px-2.5 py-1.5 text-xs font-semibold text-brand-bright hover:bg-brand/25 disabled:opacity-50"
                      >
                        {busyId === s.id ? "…" : "Full book"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
