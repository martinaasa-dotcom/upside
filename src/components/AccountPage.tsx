"use client";

import { useAuth } from "@/components/AuthProvider";
import { AppHeader } from "@/components/AppHeader";
import { BookBottomNav } from "@/components/BookBottomNav";
import { SignInGate } from "@/components/SignInGate";
import { MobileChrome } from "@/components/mobile/MobileChrome";
import { cn } from "@/lib/format";
import {
  last7DaysStrip,
  loadVisitStreak,
  streakFlavor,
  type VisitStreakState,
} from "@/lib/visit-streak";
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
  Download,
  Gauge,
  Link2,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

function VisitStreakCard() {
  const [streak, setStreak] = useState<VisitStreakState | null>(null);
  useEffect(() => {
    setStreak(loadVisitStreak());
  }, []);
  if (!streak || streak.totalVisits <= 0) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-brand-deep/30 bg-card/80 p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-white">Showing up</h2>
      <p className="text-xs text-zinc-400">{streakFlavor(streak.currentStreak)}</p>
      <div className="flex gap-1" title="Your last seven days">
        {last7DaysStrip(streak).map((visited, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-6 rounded-full",
              visited ? "bg-amber-400" : "bg-zinc-800"
            )}
          />
        ))}
      </div>
      <p className="text-xs text-zinc-500">
        {streak.currentStreak} day streak · best {streak.longestStreak} ·{" "}
        {streak.totalVisits} visits on this device
      </p>
    </section>
  );
}

export function AccountPage() {
  const router = useRouter();
  const { profile, user, signOut, refresh } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [avatarBroken, setAvatarBroken] = useState(false);
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
  const [morningNote, setMorningNote] = useState(false);
  const [morningSaved, setMorningSaved] = useState(false);
  const [morningCanSend, setMorningCanSend] = useState(false);

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
    void fetch("/api/account/morning-note")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { enabled?: boolean; canSend?: boolean } | null) => {
        if (cancelled) return;
        if (typeof data?.enabled === "boolean") {
          setMorningNote(data.enabled);
        }
        if (typeof data?.canSend === "boolean") {
          setMorningCanSend(data.canSend);
        }
      })
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

  return (
    <SignInGate>
      <div className="flex min-h-dvh flex-col bg-app text-zinc-100 md:bg-[radial-gradient(ellipse_at_top,_#100e0a_0%,_#08090C_55%)]">
        <MobileChrome title="Account" active="settings" />
        <AppHeader className="hidden md:block" title="Account">
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

        <main className="mx-auto max-w-3xl flex-1 space-y-8 px-4 py-8 pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
          <div>
            <h1 className="text-2xl font-semibold">My account</h1>
            <p className="mt-1 text-sm text-zinc-400">
              How you appear, your data, and the danger zone.
            </p>
          </div>

          <VisitStreakCard />

          <section className="space-y-3 rounded-2xl border border-brand-deep/30 bg-card/80 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-white">Morning note</h2>
            <p className="text-xs text-zinc-400">
              {morningCanSend
                ? "A short weekday note around 7am Tallinn, another after the US close, and a Sunday look. Book move, the name that did it, and Pulse if it changed. Off until you ask."
                : "The note lands in the app each weekday morning, after the close, and on Sunday. Email is not set up on this server yet."}
            </p>
            <label className="flex items-center gap-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                checked={morningNote}
                onChange={(e) => {
                  const next = e.target.checked;
                  setMorningNote(next);
                  void fetch("/api/account/morning-note", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ enabled: next }),
                  })
                    .then((r) => {
                      if (r.ok) {
                        setMorningSaved(true);
                        window.setTimeout(() => setMorningSaved(false), 2000);
                      }
                    })
                    .catch(() => {});
                }}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-brand focus:ring-brand/50"
              />
              {morningCanSend
                ? "Email me the weekday, close, and Sunday notes"
                : "Turn this on so email starts when it is set up"}
            </label>
            {morningSaved && (
              <p className="text-xs text-emerald-300">Saved.</p>
            )}
          </section>

          {/* Profile / community appearance */}
          <section className="space-y-4 rounded-2xl border border-brand-deep/30 bg-card/80 p-4 sm:p-5">
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
                    knowsOptions === true
                      ? "e.g. Long-term tech · covered calls · Tallinn"
                      : "e.g. Long-term tech · growth investor · Tallinn"
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
                className="btn-primary disabled:opacity-60"
              >
                {savingProfile ? "Saving …" : "Save profile"}
              </button>
            </form>
          </section>

          {/* Experience level */}
          <section className="space-y-3 rounded-2xl border border-brand-deep/30 bg-card/80 p-4 sm:p-5">
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

          {/* Sheet invites live next to the sheet, not here. */}
          <section className="space-y-3 rounded-2xl border border-brand-deep/30 bg-card/80 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-mid/40 bg-brand/15 text-brand-bright">
                <Link2 className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Invite a partner
                </h2>
                <p className="text-xs text-zinc-400">
                  That lives on the sheet now. Open a book, tap Invite next to
                  Add holding.
                </p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-zinc-400">
              Redeem a code at{" "}
              <Link href="/account/join" className="text-brand-bright/80 underline">
                /account/join
              </Link>
              .
            </p>
          </section>

          {/* Data & privacy */}
          <section className="space-y-4 rounded-2xl border border-brand-deep/30 bg-card/80 p-4 sm:p-5">
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
              be removed from here, revoke Upside Lab&apos;s access from your
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
    </SignInGate>
  );
}
