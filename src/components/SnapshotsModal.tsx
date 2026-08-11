"use client";

import { ConfirmModal } from "@/components/ui/ConfirmModal";
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
  const [pendingRestore, setPendingRestore] = useState<{
    kind: "book" | "sheet";
    id: string;
    label: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/snapshots");
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

  async function restoreBook(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", snapshotId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Restore failed");
      onRestored("book");
      onClose();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function restoreSheet(id: string) {
    if (!activePortfolioId) return false;
    setBusyId(`${id}:sheet`);
    setError(null);
    try {
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "restore_sheet",
          snapshotId: id,
          portfolioId: activePortfolioId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Sheet restore failed");
      onRestored("sheet");
      onClose();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sheet restore failed");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function createManual() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      <div className="relative z-10 flex max-h-[min(90dvh,560px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-brand-bright" />
            <h2 className="text-sm font-semibold text-zinc-100">Snapshots</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
          <button
            type="button"
            onClick={() => void createManual()}
            disabled={loading}
            className="rounded-md bg-brand-bright px-3 py-1.5 text-xs font-semibold text-[#1a1510] disabled:opacity-50"
          >
            Save snapshot now
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {loading && snapshots.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <p className="px-2 py-6 text-center text-sm text-red-400">{error}</p>
          ) : snapshots.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-zinc-500">
              No snapshots yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {snapshots.map((s) => (
                <li
                  key={s.id}
                  className="rounded-lg border border-zinc-800/80 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-200">{s.label}</p>
                      <p className="text-[11px] text-zinc-500">
                        {s.kind} · {formatWhen(s.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() =>
                          setPendingRestore({ kind: "book", id: s.id, label: s.label })
                        }
                        className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
                      >
                        {busyId === s.id ? "…" : "Full book"}
                      </button>
                      {activePortfolioId && (
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() =>
                            setPendingRestore({
                              kind: "sheet",
                              id: s.id,
                              label: s.label,
                            })
                          }
                          className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
                        >
                          {busyId === `${s.id}:sheet` ? "…" : "This sheet"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmModal
        open={Boolean(pendingRestore)}
        title={
          pendingRestore?.kind === "book"
            ? "Restore full book?"
            : "Restore this sheet?"
        }
        body={
          pendingRestore?.kind === "book"
            ? `Restore full book "${pendingRestore.label}"? This replaces every sheet. A safety snapshot of the current state is taken first.`
            : `Restore "${pendingRestore?.label}" into ${
                activePortfolioName ?? "this sheet"
              } only? Other sheets are untouched.`
        }
        confirmLabel="Restore"
        destructive
        onClose={() => setPendingRestore(null)}
        onConfirm={async () => {
          if (!pendingRestore) return false;
          return pendingRestore.kind === "book"
            ? restoreBook(pendingRestore.id)
            : restoreSheet(pendingRestore.id);
        }}
      />
    </div>
  );
}
