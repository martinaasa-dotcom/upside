"use client";

import { plainError } from "@/lib/plain-error";
import { useCallback, useEffect, useState } from "react";

type SheetRow = { id: string; name: string; shared: boolean };

export function ShareSheets({
  communityId,
  onChanged,
}: {
  communityId: string;
  onChanged?: () => void;
}) {
  const [sheets, setSheets] = useState<SheetRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/communities/${communityId}/sheets`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          plainError(data.error, "Couldn't load your sheets.")
        );
      }
      setSheets((data.sheets ?? []) as SheetRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your sheets.");
    }
  }, [communityId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(sheet: SheetRow) {
    setBusyId(sheet.id);
    setError(null);
    try {
      const res = await fetch(`/api/communities/${communityId}/sheets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioId: sheet.id, shared: !sheet.shared }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          plainError(data.error, "Couldn't update that.")
        );
      }
      setSheets((prev) =>
        (prev ?? []).map((s) =>
          s.id === sheet.id ? { ...s, shared: !sheet.shared } : s
        )
      );
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update that.");
    } finally {
      setBusyId(null);
    }
  }

  if (sheets === null && !error) return null;
  if (sheets && sheets.length === 0) return null;

  return (
    <section className="space-y-3 rounded-xl border border-zinc-800 p-4">
      <div>
        <h2 className="text-sm font-medium text-zinc-200">
          Sheets you share here
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">
          Off means this circle cannot see that book. Live marks only. Cost
          stays on your sheet.
        </p>
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <ul className="space-y-2">
        {(sheets ?? []).map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
          >
            <span className="min-w-0 truncate text-sm text-zinc-100">
              {s.name}
            </span>
            <button
              type="button"
              disabled={busyId === s.id}
              onClick={() => void toggle(s)}
              className="shrink-0 rounded-md border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:border-brand/50 hover:text-white disabled:opacity-50"
            >
              {busyId === s.id
                ? "Saving …"
                : s.shared
                  ? "Stop sharing"
                  : "Share"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
