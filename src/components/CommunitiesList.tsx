"use client";

import { SignInGate } from "@/components/SignInGate";
import { HeaderBrand } from "@/components/HeaderBrand";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type CommunityRow = {
  id: string;
  name: string;
  role: string;
};

export function CommunitiesList() {
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/communities", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to load"
        );
      }
      setCommunities(data.communities ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createCommunity(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    const res = await fetch("/api/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
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
                    <span className="min-w-0 truncate text-sm font-semibold text-zinc-100">
                      {c.name}
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
          <form
            onSubmit={(e) => void createCommunity(e)}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New community name"
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-brand-bright px-4 py-2.5 text-sm font-semibold text-[#1a1510] hover:bg-[#F0E4C8]"
            >
              Create community
            </button>
          </form>
        </main>
      </div>
    </SignInGate>
  );
}
