"use client";

import { SignInGate } from "@/components/SignInGate";
import { UpsideLogo } from "@/components/UpsideLogo";
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
    try {
      const res = await fetch("/api/communities", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
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
      <div className="min-h-dvh bg-[#121214] text-zinc-100">
        <header className="border-b border-zinc-800/80">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <UpsideLogo variant="mark" className="h-6 w-6" />
              <span className="text-sm font-medium">Communities</span>
            </div>
            <Link href="/" className="text-xs text-zinc-400 hover:text-zinc-200">
              My book
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
          <p className="text-sm text-zinc-400">
            See every member’s full book live — read-only. Edits happen in My
            book.
          </p>
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : (
            <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
              {communities.length === 0 && (
                <li className="px-4 py-6 text-sm text-zinc-500">
                  No communities yet. Create one or accept an invite.
                </li>
              )}
              {communities.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/communities/${c.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-zinc-900/50"
                  >
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="text-xs text-zinc-500">{c.role}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={(e) => void createCommunity(e)} className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New community name"
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900"
            >
              Create
            </button>
          </form>
        </main>
      </div>
    </SignInGate>
  );
}
