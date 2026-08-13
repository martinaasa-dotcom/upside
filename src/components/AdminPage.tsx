"use client";

import { useAuth } from "@/components/AuthProvider";
import { SignInGate } from "@/components/SignInGate";
import { HeaderBrand } from "@/components/HeaderBrand";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { isSuperadminEmail } from "@/lib/auth/superadmin";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  AlertTriangle,
  Bug,
  RefreshCw,
  Search,
  Shield,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type AdminUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  profile_created_at: string | null;
  last_sign_in_at: string | null;
  portfolios?: { id: string; name: string }[];
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

type AdminErrorLog = {
  id: string;
  source: "client" | "server";
  message: string;
  stack: string | null;
  digest: string | null;
  path: string | null;
  route_type: string | null;
  user_email: string | null;
  created_at: string;
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [errorLog, setErrorLog] = useState<AdminErrorLog[]>([]);
  const [errorLogLoading, setErrorLogLoading] = useState(true);
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [confirmClearErrors, setConfirmClearErrors] = useState(false);

  const loadErrorLog = useCallback(async () => {
    setErrorLogLoading(true);
    try {
      const res = await fetch("/api/admin/errors", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setErrorLog(data.errors ?? []);
    } catch {
      /* non-critical secondary panel */
    } finally {
      setErrorLogLoading(false);
    }
  }, []);

  async function clearErrorLog() {
    const res = await fetch("/api/admin/errors", { method: "DELETE" });
    if (!res.ok) return false;
    setErrorLog([]);
    return true;
  }

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/overview", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Failed to load"
          );
        }
        setUsers(data.users ?? []);
        setCommunities(data.communities ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      setErrorLogLoading(false);
      return;
    }
    void load(false);
    void loadErrorLog();
  }, [allowed, load, loadErrorLog]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.display_name, u.email, ...(u.portfolios?.map((p) => p.name) ?? [])]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    );
  }, [users, search]);

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
            <p className="text-sm text-zinc-500">Loading overview …</p>
          ) : error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : (
            <>
              <section className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                    <Bug className="h-3.5 w-3.5" />
                    Errors
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">
                      {errorLog.length >= 150 ? "150+" : errorLog.length} recent
                    </span>
                    {errorLog.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setConfirmClearErrors(true)}
                        title="Clear log"
                        className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 hover:border-rose-700 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void loadErrorLog()}
                      disabled={errorLogLoading}
                      title="Refresh"
                      className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${errorLogLoading ? "animate-spin" : ""}`}
                      />
                    </button>
                  </div>
                </div>
                {errorLogLoading && errorLog.length === 0 ? (
                  <p className="text-sm text-zinc-500">Loading …</p>
                ) : errorLog.length === 0 ? (
                  <p className="rounded-2xl border border-emerald-900/40 bg-emerald-950/15 px-4 py-4 text-center text-sm text-emerald-300/90">
                    Nothing logged — all clear.
                  </p>
                ) : (
                  <ul className="max-h-[28rem] divide-y divide-zinc-800 overflow-y-auto rounded-2xl border border-brand-deep/30 bg-[#161618]/70">
                    {errorLog.map((e) => {
                      const open = expandedError === e.id;
                      return (
                        <li key={e.id} className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => setExpandedError(open ? null : e.id)}
                            className="flex w-full items-start justify-between gap-2 text-left"
                          >
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 text-xs">
                                <span
                                  className={
                                    e.source === "server"
                                      ? "rounded bg-rose-500/15 px-1.5 py-0.5 font-medium text-rose-300"
                                      : "rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-300"
                                  }
                                >
                                  {e.source}
                                </span>
                                <span className="truncate text-zinc-500">
                                  {e.path || "—"}
                                </span>
                              </p>
                              <p className="mt-1 truncate text-sm text-zinc-200">
                                {e.message}
                              </p>
                            </div>
                            <span className="shrink-0 text-[11px] text-zinc-500">
                              {fmtDate(e.created_at)}
                            </span>
                          </button>
                          {open && (
                            <div className="mt-2 space-y-1 rounded-lg bg-zinc-950/60 p-2.5 text-[11px] text-zinc-500">
                              {e.user_email && <p>User: {e.user_email}</p>}
                              {e.route_type && <p>Route type: {e.route_type}</p>}
                              {e.digest && <p>Digest: {e.digest}</p>}
                              {e.stack && (
                                <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[10px] text-zinc-600">
                                  {e.stack}
                                </pre>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                    Users signed in
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">
                      {filteredUsers.length}
                      {search ? ` of ${users.length}` : ""} profile
                      {users.length === 1 ? "" : "s"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void load(true)}
                      disabled={refreshing}
                      title="Refresh"
                      className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                      />
                    </button>
                  </div>
                </div>
                {users.length > 3 && (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search name, email, or sheet …"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-8 pr-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-brand/50"
                    />
                  </div>
                )}
                <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-brand-deep/30 bg-[#161618]/70">
                  {filteredUsers.length === 0 ? (
                    <li className="px-4 py-6 text-center text-sm text-zinc-500">
                      {users.length === 0
                        ? "No profiles yet."
                        : "No profiles match that search."}
                    </li>
                  ) : (
                    filteredUsers.map((u) => {
                      const noPortfolios = (u.portfolios?.length ?? 0) === 0;
                      return (
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
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {noPortfolios ? (
                                <span
                                  className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300"
                                  title="Signed in but owns/co-owns no sheet — possible broken seed claim or invite redemption"
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  0 portfolios
                                </span>
                              ) : (
                                u.portfolios!.map((p) => (
                                  <span
                                    key={p.id}
                                    className="rounded-md bg-zinc-800/90 px-1.5 py-0.5 text-[10px] text-zinc-300"
                                  >
                                    {p.name}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 text-left text-xs text-zinc-500 sm:text-right">
                            <p>Last sign-in · {fmtDate(u.last_sign_in_at)}</p>
                            <p>Profile · {fmtDate(u.profile_created_at)}</p>
                          </div>
                        </li>
                      );
                    })
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

      <ConfirmModal
        open={confirmClearErrors}
        title="Clear error log?"
        body="Removes all logged errors. This doesn't fix anything — it just clears the list once you've triaged it."
        confirmLabel="Clear"
        destructive
        onClose={() => setConfirmClearErrors(false)}
        onConfirm={clearErrorLog}
      />
    </SignInGate>
  );
}
