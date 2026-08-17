"use client";

import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { plainError } from "@/lib/plain-error";
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
      if (!res.ok) throw new Error(plainError(data.error, "Couldn't load those saves."));
      setSnapshots(data.snapshots ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load those saves.");
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
      if (!res.ok) throw new Error(plainError(data.error, "Couldn't put that save back."));
      onRestored("book");
      onClose();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't put that save back.");
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
      if (!res.ok) throw new Error(plainError(data.error, "Couldn't put that portfolio back."));
      onRestored("sheet");
      onClose();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't put that portfolio back.");
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
        body: JSON.stringify({ action: "create", label: "Manual save" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(plainError(data.error, "Couldn't take a save."));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't take a save.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <ViewportOverlay className="z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(100%,560px)] w-full max-w-md flex-col overflow-hidden rounded-xl bg-popover ring-1 ring-foreground/10 shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Snapshots</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-3.5 text-muted-foreground hover:bg-hover hover:text-foreground sm:p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <Button
            type="button"
            onClick={() => void createManual()}
            disabled={loading}
          >
            Save snapshot now
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {loading && snapshots.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading …
            </div>
          ) : error ? (
            <p className="px-2 py-6 text-center text-sm text-loss">{error}</p>
          ) : snapshots.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No snapshots yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {snapshots.map((s) => (
                <li
                  key={s.id}
                  className="rounded-lg border border-border bg-raised px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{s.label}</p>
                      <p className="text-sm text-muted-foreground">
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
                        className="rounded border border-border px-2 py-0.5 text-sm text-muted-foreground hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
                      >
                        {busyId === s.id ? "…" : "All portfolios"}
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
                          className="rounded border border-border px-2 py-0.5 text-sm text-muted-foreground hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
                        >
                          {busyId === `${s.id}:sheet` ? "…" : "This portfolio"}
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
            ? "Restore your portfolios?"
            : "Restore this portfolio?"
        }
        body={
          pendingRestore?.kind === "book"
            ? `Put "${pendingRestore.label}" back on the portfolios you own? Other people's portfolios stay as they are. A safety save of yours is taken first.`
            : `Restore "${pendingRestore?.label}" into ${
                activePortfolioName ?? "this portfolio"
              } only? Other portfolios are untouched.`
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
    </ViewportOverlay>
  );
}
