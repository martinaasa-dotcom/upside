"use client";

import { useAuth } from "@/components/AuthProvider";
import { SignInGate } from "@/components/SignInGate";
import { HeaderBrand } from "@/components/HeaderBrand";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { isSuperadminEmail } from "@/lib/auth/superadmin";
import { Shield } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type AdminUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  profile_created_at: string | null;
  last_sign_in_at: string | null;
};

type AdminMember = {
  user_id: string;
  role: string;
  joined_at: string | null;
  email: string | null;
  display_name: string | null;
};

type AdminCommunity = {
  id: string;
  name: string;
  created_at: string | null;
  member_count: number;
  members: AdminMember[];
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function AdminPage() {
  const { user } = useAuth();
  const allowed = isSuperadminEmail(user?.email);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [communities, setCommunities] = useState<AdminCommunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/overview", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Failed to load"
          );
        }
        if (cancelled) return;
        setUsers(data.users ?? []);
        setCommunities(data.communities ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  return (
    <SignInGate>
      <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_#1f1a12_0%,_#121214_55%)] text-zinc-100">
        <header className="border-b border-brand-deep/25 bg-[#121214]/90 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <HeaderBrand />
              <WorkspaceSwitcher />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-mid/40 bg-brand/15 text-brand-bright">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                Superadmin
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                All signed-in Upside profiles, communities, and membership.
              </p>
            </div>
          </div>

          {!allowed ? (
            <p className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              This account is not a superadmin.
            </p>
          ) : loading ? (
            <p className="text-sm text-zinc-500">Loading overview…</p>
          ) : error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : (
            <>
              <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                    Users signed in
                  </h2>
                  <span className="text-xs text-zinc-500">
                    {users.length} profile{users.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-brand-deep/30 bg-[#161618]/70">
                  {users.length === 0 ? (
                    <li className="px-4 py-6 text-center text-sm text-zinc-500">
                      No profiles yet.
                    </li>
                  ) : (
                    users.map((u) => (
                      <li
                        key={u.id}
                        className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {u.display_name || "—"}
                          </p>
                          <p className="truncate text-xs text-zinc-500">
                            {u.email || u.id}
                          </p>
                          {u.bio ? (
                            <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600">
                              {u.bio}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-left text-xs text-zinc-500 sm:text-right">
                          <p>Last sign-in · {fmtDate(u.last_sign_in_at)}</p>
                          <p>Profile · {fmtDate(u.profile_created_at)}</p>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </section>

              <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                    Communities
                  </h2>
                  <span className="text-xs text-zinc-500">
                    {communities.length}{" "}
                    {communities.length === 1 ? "community" : "communities"}
                  </span>
                </div>
                <div className="space-y-3">
                  {communities.length === 0 ? (
                    <p className="rounded-2xl border border-brand-deep/30 bg-[#161618]/70 px-4 py-6 text-center text-sm text-zinc-500">
                      No communities yet.
                    </p>
                  ) : (
                    communities.map((c) => (
                      <article
                        key={c.id}
                        className="space-y-3 rounded-2xl border border-brand-deep/30 bg-[#161618]/70 p-4"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div>
                            <h3 className="text-base font-semibold text-white">
                              {c.name}
                            </h3>
                            <p className="text-xs text-zinc-500">
                              Created {fmtDate(c.created_at)} ·{" "}
                              {c.member_count} member
                              {c.member_count === 1 ? "" : "s"}
                            </p>
                          </div>
                          <Link
                            href={`/communities/${c.id}`}
                            className="text-xs font-medium text-brand-bright/90 hover:underline"
                          >
                            Open
                          </Link>
                        </div>
                        <ul className="divide-y divide-zinc-800/80 overflow-hidden rounded-xl border border-zinc-800/80">
                          {(c.members ?? []).map((m) => (
                            <li
                              key={`${c.id}-${m.user_id}`}
                              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-medium text-zinc-200">
                                  {m.display_name || m.email || m.user_id}
                                </p>
                                {m.display_name && m.email ? (
                                  <p className="truncate text-xs text-zinc-500">
                                    {m.email}
                                  </p>
                                ) : null}
                              </div>
                              <span
                                className={
                                  m.role === "admin"
                                    ? "shrink-0 rounded-md bg-brand/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-bright"
                                    : "shrink-0 text-[11px] uppercase tracking-wide text-zinc-500"
                                }
                              >
                                {m.role}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </SignInGate>
  );
}
