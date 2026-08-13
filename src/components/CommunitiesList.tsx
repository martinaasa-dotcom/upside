"use client";

import { SignInGate } from "@/components/SignInGate";
import { HeaderBrand } from "@/components/HeaderBrand";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { cn } from "@/lib/format";
import { prefetchCommunity } from "@/lib/community-cache";
import { ChevronRight, Compass, Globe, Lock, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type CommunityRow = {
  id: string;
  name: string;
  role: string;
  visibility?: "public" | "private";
};

type DiscoverRow = {
  id: string;
  name: string;
  memberCount: number;
  requestStatus: "pending" | "approved" | "rejected" | null;
};

const LIST_CACHE_KEY = "upside-communities-list-v1";

function loadListCache(): CommunityRow[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LIST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CommunityRow[]) : null;
  } catch {
    return null;
  }
}

function saveListCache(rows: CommunityRow[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LIST_CACHE_KEY, JSON.stringify(rows));
  } catch {
    /* ignore quota / private mode */
  }
}

export function CommunitiesList() {
  const [communities, setCommunities] = useState<CommunityRow[]>(
    () => loadListCache() ?? []
  );
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [error, setError] = useState<string | null>(null);
  // Only blocks on a spinner when there's truly nothing cached to show —
  // same instant-first-paint pattern as Thesis Pulse and the community
  // detail view.
  const [loading, setLoading] = useState(() => loadListCache() === null);
  const [discover, setDiscover] = useState<DiscoverRow[]>([]);
  const [requestBusyId, setRequestBusyId] = useState<string | null>(null);

  async function load() {
    const hadCache = communities.length > 0;
    if (!hadCache) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/communities", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to load"
        );
      }
      const rows = (data.communities ?? []) as CommunityRow[];
      setCommunities(rows);
      saveListCache(rows);
      // Warm each community's own cache in the background so clicking in
      // right after the list loads is instant too, not just the list
      // itself.
      for (const c of rows) void prefetchCommunity(c.id);
    } catch (e) {
      if (!hadCache) setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function loadDiscover() {
    try {
      const res = await fetch("/api/communities/discover", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setDiscover((data.communities ?? []) as DiscoverRow[]);
    } catch {
      /* best-effort — discover is a bonus section, not the main list */
    }
  }

  useEffect(() => {
    void load();
    void loadDiscover();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, []);

  async function requestToJoin(communityId: string) {
    setRequestBusyId(communityId);
    try {
      const res = await fetch(`/api/communities/${communityId}/join-request`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      setDiscover((rows) =>
        rows.map((r) => (r.id === communityId ? { ...r, requestStatus: "pending" } : r))
      );
    } finally {
      setRequestBusyId(null);
    }
  }

  async function createCommunity(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    const res = await fetch("/api/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), visibility }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Create failed");
      return;
    }
    setName("");
    await load();
  }

  return (
    <SignInGate>
      <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_#1f1a12_0%,_#121214_55%)] text-zinc-100">
        <header className="border-b border-brand-deep/25 bg-[#121214]/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <HeaderBrand />
              <WorkspaceSwitcher />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Communities
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Live books from every member — read-only. Edits stay in My book.
            </p>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {loading ? (
            <div className="space-y-2" aria-hidden>
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-[3.75rem] animate-pulse rounded-2xl border border-brand-deep/20 bg-[#161618]/70"
                />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-brand-deep/30 bg-[#161618]/70">
              {communities.length === 0 && (
                <li className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <Users className="h-6 w-6 text-zinc-600" />
                  <p className="text-sm text-zinc-400">
                    No communities yet.
                  </p>
                  <p className="text-xs text-zinc-600">
                    Create one below, or ask a member for an invite link.
                  </p>
                </li>
              )}
              {communities.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/communities/${c.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-4 transition hover:bg-brand/5"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {c.visibility === "public" ? (
                        <Globe className="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
                      ) : (
                        <Lock className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                      )}
                      <span className="min-w-0 truncate text-sm font-semibold text-zinc-100">
                        {c.name}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs capitalize text-brand-bright/80">
                        {c.role}
                      </span>
                      <ChevronRight className="h-4 w-4 text-zinc-600" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {discover.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Compass className="h-4 w-4 text-sky-400/80" />
                <h2 className="text-sm font-semibold text-zinc-200">
                  Discover public communities
                </h2>
              </div>
              <p className="mb-3 text-xs text-zinc-500">
                Anyone can ask to join — an admin still has to approve before
                you see any books.
              </p>
              <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-brand-deep/30 bg-[#161618]/70">
                {discover.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 px-4 py-3.5"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Globe className="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
                      <span className="min-w-0 truncate text-sm font-medium text-zinc-100">
                        {c.name}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
                      </span>
                    </span>
                    {c.requestStatus === "pending" ? (
                      <span className="shrink-0 text-xs font-medium text-amber-400">
                        Requested · pending
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void requestToJoin(c.id)}
                        disabled={requestBusyId === c.id}
                        className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-brand/50 hover:text-white disabled:opacity-50"
                      >
                        {requestBusyId === c.id
                          ? "Requesting …"
                          : c.requestStatus === "rejected"
                            ? "Request again"
                            : "Request to join"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form
            onSubmit={(e) => void createCommunity(e)}
            className="space-y-2.5 rounded-2xl border border-brand-deep/20 bg-[#161618]/50 p-4"
          >
            <p className="text-sm font-medium text-zinc-200">
              Create a community
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Community name"
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm"
              />
              <button
                type="submit"
                className="rounded-lg bg-brand-bright px-4 py-2.5 text-sm font-semibold text-[#1a1510] hover:bg-[#F0E4C8]"
              >
                Create community
              </button>
            </div>
            <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1 sm:w-fit">
              {(
                [
                  ["private", Lock, "Private — invite only"],
                  ["public", Globe, "Public — anyone can request to join"],
                ] as const
              ).map(([id, Icon, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setVisibility(id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                    visibility === id
                      ? "bg-brand/20 text-brand-bright"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </form>
        </main>
      </div>
    </SignInGate>
  );
}
