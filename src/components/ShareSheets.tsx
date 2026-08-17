"use client";

import { plainError } from "@/lib/plain-error";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import {
  loadCommunitySheetsCache,
  saveCommunitySheetsCache,
  type CommunitySheetRow,
} from "@/lib/community-cache";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";

type SheetRow = CommunitySheetRow;

export function ShareSheets({
  communityId,
  onChanged,
}: {
  communityId: string;
  onChanged?: () => void;
}) {
  const [sheets, setSheets] = useHydratedCache<SheetRow[] | null>(
    () => loadCommunitySheetsCache(communityId),
    null
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commit = useCallback(
    (next: SheetRow[]) => {
      saveCommunitySheetsCache(communityId, next);
      setSheets(next);
    },
    [communityId, setSheets]
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await fetch(`/api/communities/${communityId}/sheets`, {
          cache: "no-store",
          signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            plainError(data.error, "Couldn't load your portfolios.")
          );
        }
        commit((data.sheets ?? []) as SheetRow[]);
        setError(null);
      } catch (e) {
        if (signal?.aborted) return;
        // Keep the last cached list on screen. Only show an error when
        // there was nothing to paint.
        if (loadCommunitySheetsCache(communityId) != null) return;
        setError(
          e instanceof Error ? e.message : "Couldn't load your portfolios."
        );
      }
    },
    [communityId, commit]
  );

  useLayoutEffect(() => {
    setSheets(loadCommunitySheetsCache(communityId));
    setError(null);
  }, [communityId, setSheets]);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  async function toggle(sheet: SheetRow) {
    setBusyId(sheet.id);
    setError(null);
    const next = (sheets ?? []).map((s) =>
      s.id === sheet.id ? { ...s, shared: !sheet.shared } : s
    );
    commit(next);
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
      onChanged?.();
    } catch (e) {
      commit(sheets ?? []);
      setError(e instanceof Error ? e.message : "Couldn't update that.");
    } finally {
      setBusyId(null);
    }
  }

  if (sheets === null && !error) return null;
  if (sheets && sheets.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card ring-1 ring-foreground/10 p-4">
      <div>
        <h2 className="text-sm font-medium text-foreground">
          Portfolios this circle can see
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          These are on unless you turn one off. Today&apos;s prices only. What
          you paid stays with you.
        </p>
      </div>
      {error && <p className="text-sm text-loss">{error}</p>}
      <ul className="flex flex-col gap-2">
        {(sheets ?? []).map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-raised px-3 py-2"
          >
            <span className="min-w-0 truncate text-sm text-foreground">
              {s.name}
            </span>
            <button
              type="button"
              disabled={busyId === s.id}
              onClick={() => void toggle(s)}
              className="shrink-0 rounded-md border border-border px-2.5 py-1 text-sm font-medium text-foreground hover:border-foreground/20/50 hover:text-foreground disabled:opacity-50"
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
