"use client";

import { useAuth } from "@/components/AuthProvider";
import { SignInGate } from "@/components/SignInGate";
import { HeaderBrand } from "@/components/HeaderBrand";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import {
  Check,
  Copy,
  Link2,
  LogOut,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type PortfolioRow = {
  id: string;
  name: string;
  slug: string;
};

type OwnerRow = {
  user_id: string;
  created_at: string;
  profile: {
    id: string;
    email: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export function AccountPage() {
  const router = useRouter();
  const { profile, user, signOut, refresh } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [portfolios, setPortfolios] = useState<PortfolioRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [inviteErr, setInviteErr] = useState<string | null>(null);
  const [busyInvite, setBusyInvite] = useState(false);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
    setBio(profile?.bio ?? "");
    setAvatarUrl(profile?.avatar_url ?? "");
  }, [profile]);

  const loadPortfolios = useCallback(async () => {
    try {
      const res = await fetch("/api/portfolios", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const list = ((data.portfolios ?? []) as PortfolioRow[]).map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
      }));
      setPortfolios(list);
      setSelectedId((prev) => prev || list[0]?.id || "");
    } catch {
      /* ignore */
    }
  }, []);

  const loadOwners = useCallback(async (portfolioId: string) => {
    if (!portfolioId) {
      setOwners([]);
      return;
    }
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/owners`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setOwners([]);
        return;
      }
      const data = await res.json();
      setOwners(data.owners ?? []);
    } catch {
      setOwners([]);
    }
  }, []);

  useEffect(() => {
    void loadPortfolios();
  }, [loadPortfolios]);

  useEffect(() => {
    if (selectedId) void loadOwners(selectedId);
  }, [selectedId, loadOwners]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileErr(null);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim(),
          bio: bio.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setProfileMsg("Saved — this is how you appear in communities.");
      await refresh();
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingProfile(false);
    }
  }

  async function createInvite(opts?: { emailOnly?: boolean }) {
    if (!selectedId) return;
    setBusyInvite(true);
    setInviteErr(null);
    setInviteMsg(null);
    setInviteLink(null);
    setInviteCode(null);
    try {
      const email = inviteEmail.trim();
      if (opts?.emailOnly && email) {
        // Direct add if they already have an Upside profile
        const res = await fetch(`/api/portfolios/${selectedId}/owners`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (res.ok) {
          setInviteMsg(`Added ${email} as co-owner.`);
          setInviteEmail("");
          await loadOwners(selectedId);
          return;
        }
        // Fall through to invite code if they haven't signed in yet
        if (res.status !== 404) {
          throw new Error(data.error ?? "Invite failed");
        }
      }

      const res = await fetch(`/api/portfolios/${selectedId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email || undefined,
          daysValid: 14,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create invite");

      const url = `${window.location.origin}${data.path}`;
      setInviteLink(url);
      setInviteCode(data.code ?? data.token);
      setInviteMsg(
        email
          ? `Invite ready for ${email} — share the link or code.`
          : "Invite ready — share the link or code with your partner."
      );
      await navigator.clipboard.writeText(url).catch(() => undefined);
      setCopied("link");
      window.setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      setInviteErr(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusyInvite(false);
    }
  }

  async function copy(text: string, kind: "link" | "code") {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
  }

  const selectedName =
    portfolios.find((p) => p.id === selectedId)?.name ?? "sheet";

  return (
    <SignInGate>
      <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_#1f1a12_0%,_#121214_55%)] text-zinc-100">
        <header className="border-b border-brand-deep/25 bg-[#121214]/90 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <HeaderBrand />
              <WorkspaceSwitcher />
            </div>
            <button
              type="button"
              onClick={() =>
                void signOut().then(() => {
                  router.push("/");
                })
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My account</h1>
            <p className="mt-1 text-sm text-zinc-400">
              How you appear in communities, and invite partners onto your
              sheets.
            </p>
          </div>

          {/* Profile / community appearance */}
          <section className="space-y-4 rounded-2xl border border-brand-deep/30 bg-[#161618]/70 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-mid/40 bg-brand/15 text-brand-bright">
                <UserRound className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Community profile
                </h2>
                <p className="text-xs text-zinc-500">
                  Signed in as {user?.email ?? "—"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-3">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/20 text-sm font-semibold text-brand-bright">
                  {(displayName || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {displayName || "Your name"}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {bio || "Add a short bio for the community scoreboard."}
                </p>
              </div>
            </div>

            <form onSubmit={(e) => void saveProfile(e)} className="space-y-3">
              <label className="block space-y-1">
                <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Display name
                </span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={80}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm"
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Bio · communities
                </span>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={280}
                  rows={3}
                  placeholder="e.g. Long-term tech · covered calls · Tallinn"
                  className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Avatar URL (optional)
                </span>
                <input
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm"
                />
              </label>
              {profileErr && (
                <p className="text-sm text-red-400">{profileErr}</p>
              )}
              {profileMsg && (
                <p className="text-sm text-emerald-400">{profileMsg}</p>
              )}
              <button
                type="submit"
                disabled={savingProfile}
                className="rounded-lg bg-brand-bright px-4 py-2.5 text-sm font-semibold text-[#1a1510] hover:bg-[#F0E4C8] disabled:opacity-60"
              >
                {savingProfile ? "Saving…" : "Save profile"}
              </button>
            </form>
          </section>

          {/* Portfolio invites */}
          <section className="space-y-4 rounded-2xl border border-brand-deep/30 bg-[#161618]/70 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-mid/40 bg-brand/15 text-brand-bright">
                <Link2 className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Invite to a portfolio
                </h2>
                <p className="text-xs text-zinc-500">
                  Partners get full live edit access to that sheet — not
                  community read-only.
                </p>
              </div>
            </div>

            {portfolios.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No sheets in My book yet. Create one first.
              </p>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                    Sheet
                  </span>
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm"
                  >
                    {portfolios.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                    Partner email (optional)
                  </span>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="partner@work.com or personal@…"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm"
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyInvite}
                    onClick={() => void createInvite({ emailOnly: true })}
                    className="rounded-lg bg-brand-bright px-4 py-2.5 text-sm font-semibold text-[#1a1510] hover:bg-[#F0E4C8] disabled:opacity-60"
                  >
                    {busyInvite ? "Working…" : "Create invite code"}
                  </button>
                </div>

                {inviteErr && (
                  <p className="text-sm text-red-400">{inviteErr}</p>
                )}
                {inviteMsg && (
                  <p className="text-sm text-emerald-400">{inviteMsg}</p>
                )}

                {(inviteLink || inviteCode) && (
                  <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                    {inviteCode && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                            Invite code · {selectedName}
                          </p>
                          <p className="mt-0.5 font-mono text-sm text-brand-bright">
                            {inviteCode}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void copy(inviteCode, "code")}
                          className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"
                        >
                          {copied === "code" ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          Copy code
                        </button>
                      </div>
                    )}
                    {inviteLink && (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/80 pt-2">
                        <p className="min-w-0 flex-1 break-all text-xs text-zinc-400">
                          {inviteLink}
                        </p>
                        <button
                          type="button"
                          onClick={() => void copy(inviteLink, "link")}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"
                        >
                          {copied === "link" ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          Copy link
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {owners.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                      Co-owners on {selectedName}
                    </p>
                    <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800">
                      {owners.map((o) => (
                        <li
                          key={o.user_id}
                          className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
                        >
                          <span className="truncate text-zinc-200">
                            {o.profile?.display_name ||
                              o.profile?.email ||
                              o.user_id.slice(0, 8)}
                            {o.user_id === user?.id && (
                              <span className="ml-2 text-xs text-zinc-500">
                                (you)
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-xs text-zinc-500">
                            {o.profile?.email}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>

          <p className="text-center text-xs text-zinc-600">
            Partner signs in with Google, then opens the invite link — or pastes
            the code at{" "}
            <Link href="/account/join" className="text-brand-bright/80 underline">
              /account/join
            </Link>
            .
          </p>
        </main>
      </div>
    </SignInGate>
  );
}
