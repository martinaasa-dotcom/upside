"use client";

import { useAuth } from "@/components/AuthProvider";
import { BookBottomNav } from "@/components/BookBottomNav";
import { AppHeader } from "@/components/AppHeader";
import { SignInGate } from "@/components/SignInGate";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { cn } from "@/lib/format";
import {
  EXPERIENCE_TIERS,
  loadStoredKnowsOptions,
  loadStoredTier,
  saveStoredKnowsOptions,
  saveStoredTier,
  type ExperienceTier,
} from "@/lib/experience-tier";
import { track } from "@vercel/analytics";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Gauge,
  Link2,
  LogOut,
  ShieldCheck,
  UserMinus,
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
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [removeOwnerTarget, setRemoveOwnerTarget] = useState<OwnerRow | null>(
    null
  );
  const [removeOwnerErr, setRemoveOwnerErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [tier, setTier] = useState<ExperienceTier | null>(loadStoredTier);
  const [tierSaved, setTierSaved] = useState(false);
  const [knowsOptions, setKnowsOptions] = useState<boolean | null>(
    loadStoredKnowsOptions
  );
  const [knowsOptionsSaved, setKnowsOptionsSaved] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
    setBio(profile?.bio ?? "");
    setAvatarUrl(profile?.avatar_url ?? "");
    setAvatarBroken(false);
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/account/experience-tier")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            tier?: ExperienceTier | null;
            knowsOptions?: boolean | null;
          } | null
        ) => {
          if (cancelled) return;
          if (data?.tier) setTier(data.tier);
          if (typeof data?.knowsOptions === "boolean") {
            setKnowsOptions(data.knowsOptions);
          }
        }
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTierChange = useCallback(async (next: ExperienceTier) => {
    setTier(next);
    saveStoredTier(next);
    setTierSaved(false);
    try {
      await fetch("/api/account/experience-tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: next }),
      });
      setTierSaved(true);
      track("experience_tier_set", { tier: next, source: "account" });
      setTimeout(() => setTierSaved(false), 2000);
    } catch {
      /* localStorage already has it */
    }
  }, []);

  const handleKnowsOptionsChange = useCallback(async (next: boolean) => {
    setKnowsOptions(next);
    saveStoredKnowsOptions(next);
    setKnowsOptionsSaved(false);
    try {
      await fetch("/api/account/experience-tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowsOptions: next }),
      });
      setKnowsOptionsSaved(true);
      track("experience_tier_set", { knowsOptions: next, source: "account" });
      setTimeout(() => setKnowsOptionsSaved(false), 2000);
    } catch {
      /* localStorage already has it */
    }
  }, []);

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
      setProfileMsg("Saved. This is how you appear in communities.");
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
          track("portfolio_invite_created", { direct_add: true });
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

      track("portfolio_invite_created");
      const url = `${window.location.origin}${data.path}`;
      setInviteLink(url);
      setInviteCode(data.code ?? data.token);
      setInviteMsg(
        email
          ? `Invite ready for ${email}. Share the link or code.`
          : "Invite ready. Share the link or code with your partner."
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

  async function removeOwner(userId: string) {
    if (!selectedId) return false;
    setRemoveOwnerErr(null);
    try {
      const res = await fetch(
        `/api/portfolios/${selectedId}/owners?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Remove failed");
      }
      await loadOwners(selectedId);
      return true;
    } catch (err) {
      setRemoveOwnerErr(err instanceof Error ? err.message : "Remove failed");
      return false;
    }
  }

  async function exportData() {
    setExporting(true);
    setExportErr(null);
    try {
      const res = await fetch("/api/account/export", { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `upside-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportErr(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteErr(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      await signOut();
      router.push(data.authDeleted ? "/?accountDeleted=full" : "/?accountDeleted=data");
    } catch (err) {
      setDeleteErr(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  const selectedName =
    portfolios.find((p) => p.id === selectedId)?.name ?? "sheet";

  return (
    <SignInGate>
      <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_#1f1a12_0%,_#121214_55%)] text-zinc-100">
        <AppHeader title="Account">
          <button
            type="button"
            onClick={() =>
              void signOut().then(() => {
                router.push("/");
              })
            }
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </AppHeader>

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
                <p className="text-xs text-zinc-400">
                  Signed in as {user?.email ?? "—"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-3">
              {avatarUrl && !avatarBroken ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  onError={() => setAvatarBroken(true)}
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
                <p className="truncate text-xs text-zinc-400">
                  {bio || "Add a short bio for the community scoreboard."}
                </p>
              </div>
            </div>

            <form onSubmit={(e) => void saveProfile(e)} className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-zinc-400">
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
                <span className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wide text-zinc-400">
                    Bio · communities
                  </span>
                  <span className="text-xs tabular-nums text-zinc-400">
                    {bio.length}/280
                  </span>
                </span>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={280}
                  rows={3}
                  placeholder={
                    knowsOptions === false
                      ? "e.g. Long-term tech · growth investor · Tallinn"
                      : "e.g. Long-term tech · covered calls · Tallinn"
                  }
                  className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs uppercase tracking-wide text-zinc-400">
                  Avatar URL (optional)
                </span>
                <input
                  value={avatarUrl}
                  onChange={(e) => {
                    setAvatarUrl(e.target.value);
                    setAvatarBroken(false);
                  }}
                  placeholder="https://…"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm"
                />
                {avatarBroken && (
                  <span className="text-xs text-amber-400/90">
                    Couldn&apos;t load that image, showing your initial instead.
                  </span>
                )}
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
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-[#121214] hover:bg-brand-bright disabled:opacity-60"
              >
                {savingProfile ? "Saving …" : "Save profile"}
              </button>
            </form>
          </section>

          {/* Experience level */}
          <section className="space-y-3 rounded-2xl border border-brand-deep/30 bg-[#161618]/70 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-mid/40 bg-brand/15 text-brand-bright">
                <Gauge className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Experience level</h2>
                <p className="text-xs text-zinc-400">
                  Simplifies what&apos;s shown. Nothing is locked, change it anytime.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {EXPERIENCE_TIERS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void handleTierChange(t.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition",
                    tier === t.id
                      ? "border-brand-mid bg-brand/15 text-white"
                      : "border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-zinc-600"
                  )}
                >
                  <span>
                    <span className="font-medium">{t.label}</span>
                    <span className="mt-0.5 block text-xs text-zinc-400">{t.blurb}</span>
                  </span>
                  {tier === t.id && <Check className="h-4 w-4 shrink-0 text-brand-bright" />}
                </button>
              ))}
            </div>
            {tierSaved && <p className="text-xs text-gain">Saved.</p>}

            <div className="mt-4 border-t border-zinc-800 pt-4">
              <p className="text-sm font-medium text-white">Options experience</p>
              <p className="mt-0.5 text-xs text-zinc-400">
                Controls covered calls, strike alerts, and Call % everywhere.
                Separate from the level above.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleKnowsOptionsChange(true)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left text-sm transition",
                    knowsOptions === true
                      ? "border-brand-mid bg-brand/15 text-white"
                      : "border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-zinc-600"
                  )}
                >
                  <span className="font-medium">Yes</span>
                  <span className="mt-0.5 block text-xs text-zinc-400">
                    Show covered calls
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleKnowsOptionsChange(false)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left text-sm transition",
                    knowsOptions === false
                      ? "border-brand-mid bg-brand/15 text-white"
                      : "border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-zinc-600"
                  )}
                >
                  <span className="font-medium">No</span>
                  <span className="mt-0.5 block text-xs text-zinc-400">
                    Hide options entirely
                  </span>
                </button>
              </div>
              {knowsOptionsSaved && <p className="mt-2 text-xs text-gain">Saved.</p>}
            </div>
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
                <p className="text-xs text-zinc-400">
                  Partners get full live edit access to that sheet, not
                  community read-only.
                </p>
              </div>
            </div>

            {portfolios.length === 0 ? (
              <p className="text-sm text-zinc-400">
                No sheets in My book yet. Create one first.
              </p>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-zinc-400">
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
                  <span className="text-xs uppercase tracking-wide text-zinc-400">
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
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-[#121214] hover:bg-brand-bright disabled:opacity-60"
                  >
                    {busyInvite ? "Working …" : "Create invite code"}
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
                          <p className="text-xs uppercase tracking-wide text-zinc-400">
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
                    <p className="text-xs uppercase tracking-wide text-zinc-400">
                      Co-owners on {selectedName}
                    </p>
                    {removeOwnerErr && (
                      <p className="text-sm text-red-400">{removeOwnerErr}</p>
                    )}
                    <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800">
                      {owners.map((o) => (
                        <li
                          key={o.user_id}
                          className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
                        >
                          <span className="min-w-0 truncate text-zinc-200">
                            {o.profile?.display_name ||
                              o.profile?.email ||
                              o.user_id.slice(0, 8)}
                            {o.user_id === user?.id && (
                              <span className="ml-2 text-xs text-zinc-400">
                                (you)
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-xs text-zinc-400">
                              {o.profile?.email}
                            </span>
                            {owners.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRemoveOwnerErr(null);
                                  setRemoveOwnerTarget(o);
                                }}
                                title={
                                  o.user_id === user?.id
                                    ? "Leave this sheet"
                                    : "Remove co-owner"
                                }
                                aria-label={
                                  o.user_id === user?.id
                                    ? "Leave this sheet"
                                    : "Remove co-owner"
                                }
                                className="touch-target rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-rose-300"
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Data & privacy */}
          <section className="space-y-4 rounded-2xl border border-brand-deep/30 bg-[#161618]/70 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-mid/40 bg-brand/15 text-brand-bright">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Data &amp; privacy
                </h2>
                <p className="text-xs text-zinc-400">
                  Your data, your call. Export it or wipe it any time.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-3">
              <div>
                <p className="text-sm font-medium text-white">
                  Download everything
                </p>
                <p className="text-xs text-zinc-400">
                  One JSON file: profile, sheets, holdings, Lab state.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void exportData()}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" />
                {exporting ? "Preparing …" : "Export my data"}
              </button>
            </div>
            {exportErr && <p className="text-sm text-red-400">{exportErr}</p>}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-900/40 bg-rose-950/10 px-3 py-3">
              <div>
                <p className="text-sm font-medium text-rose-200">
                  Delete my account
                </p>
                <p className="text-xs text-zinc-400">
                  Removes your profile, deletes sheets only you own, and steps
                  you off any shared ones. Cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeleteErr(null);
                  setDeleteText("");
                  setDeleteOpen(true);
                }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-800 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-950/40"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Delete account
              </button>
            </div>

            <p className="text-center text-xs text-zinc-400">
              <Link href="/privacy" className="underline hover:text-zinc-400">
                Privacy policy
              </Link>
              {" · "}
              <Link href="/terms" className="underline hover:text-zinc-400">
                Terms of service
              </Link>
            </p>
          </section>

          <p className="text-center text-xs text-zinc-400">
            Partner signs in with Google, then opens the invite link, or pastes
            the code at{" "}
            <Link href="/account/join" className="text-brand-bright/80 underline">
              /account/join
            </Link>
            .
          </p>
        </main>
        <BookBottomNav />
      </div>

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => !deleting && setDeleteOpen(false)}
          />
          <div className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-rose-900/50 bg-zinc-950 p-5 shadow-2xl sm:max-w-md sm:rounded-2xl">
            <h3 className="text-base font-semibold text-rose-200">
              Delete your account?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              This permanently deletes your profile and any sheet you&apos;re
              the sole owner of (holdings included). Shared sheets stay for
              your co-owner. Where possible this also removes your sign-in
              itself, so the account can&apos;t be used again; if it can&apos;t
              be removed from here, revoke Upside&apos;s access from your
              Google account separately if you want that severed too.
            </p>
            <label className="mt-4 block space-y-1">
              <span className="text-xs uppercase tracking-wide text-zinc-400">
                Type DELETE to confirm
              </span>
              <input
                autoFocus
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder="DELETE"
                className="w-full rounded-lg border border-rose-900/60 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none focus:border-rose-500"
              />
            </label>
            {deleteErr && (
              <p className="mt-3 text-sm text-rose-400">{deleteErr}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteAccount()}
                disabled={deleting || deleteText.trim() !== "DELETE"}
                className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400 disabled:opacity-40"
              >
                {deleting ? "Deleting …" : "Permanently delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(removeOwnerTarget)}
        title={
          removeOwnerTarget?.user_id === user?.id
            ? "Leave this sheet?"
            : "Remove co-owner?"
        }
        body={
          removeOwnerTarget?.user_id === user?.id
            ? `You'll lose edit access to ${selectedName}. Another owner can re-invite you later.`
            : `${
                removeOwnerTarget?.profile?.display_name ||
                removeOwnerTarget?.profile?.email ||
                "This person"
              } will lose edit access to ${selectedName} immediately.`
        }
        confirmLabel={removeOwnerTarget?.user_id === user?.id ? "Leave" : "Remove"}
        destructive
        onClose={() => setRemoveOwnerTarget(null)}
        onConfirm={async () => {
          if (!removeOwnerTarget) return false;
          return removeOwner(removeOwnerTarget.user_id);
        }}
      />
    </SignInGate>
  );
}
