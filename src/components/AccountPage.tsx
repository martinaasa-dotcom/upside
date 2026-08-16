"use client";

import { useAuth } from "@/components/AuthProvider";
import { AppHeader } from "@/components/AppHeader";
import { BookBottomNav } from "@/components/BookBottomNav";
import { SignInGate } from "@/components/SignInGate";
import { MobileChrome } from "@/components/mobile/MobileChrome";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { cn } from "@/lib/format";
import { PAGE_FRAME_CLASS, PAGE_MAIN_CLASS } from "@/lib/page-shell";
import { plainError } from "@/lib/plain-error";
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
import { useTimeout } from "@/lib/use-timeout";
import { useCallback, useEffect, useState } from "react";
import { useHydratedCache } from "@/lib/use-hydrated-cache";

function VisitStreakCard() {
  const [streak] = useHydratedCache<VisitStreakState | null>(
    loadVisitStreak,
    null
  );
  if (!streak || streak.totalVisits <= 0) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card/80 p-4 sm:p-5">
      <h2 className="text-base font-bold text-foreground">Showing up</h2>
      <p className="text-sm text-muted">{streakFlavor(streak.currentStreak)}</p>
      <div className="flex gap-1" title="Your last seven days">
        {last7DaysStrip(streak).map((visited, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 w-6 rounded-full",
              visited ? "bg-select" : "bg-hover"
            )}
          />
        ))}
      </div>
      <p className="text-sm text-muted">
        {streak.currentStreak} day streak · best {streak.longestStreak} ·{" "}
        {streak.totalVisits} visits on this device
      </p>
    </section>
  );
}

export function AccountPage() {
  const router = useRouter();
  const { profile, user, signOut, refresh } = useAuth();
  const later = useTimeout();
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
  const [noteMorning, setNoteMorning] = useState(false);
  const [noteSunday, setNoteSunday] = useState(false);
  const [morningSaved, setMorningSaved] = useState(false);
  const [morningCanSend, setMorningCanSend] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
    setBio(profile?.bio ?? "");
    setAvatarUrl(profile?.avatar_url ?? "");
    setAvatarBroken(false);
  }, [profile]);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetch("/api/account/experience-tier", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            tier?: ExperienceTier | null;
            knowsOptions?: boolean | null;
          } | null
        ) => {
          if (ctrl.signal.aborted) return;
          if (data?.tier) setTier(data.tier);
          if (typeof data?.knowsOptions === "boolean") {
            setKnowsOptions(data.knowsOptions);
          }
        }
      )
      .catch(() => {});
    void fetch("/api/account/morning-note", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            morning?: boolean;
            sunday?: boolean;
            enabled?: boolean;
            canSend?: boolean;
          } | null
        ) => {
        if (ctrl.signal.aborted) return;
        if (typeof data?.morning === "boolean") setNoteMorning(data.morning);
        else if (typeof data?.enabled === "boolean") setNoteMorning(data.enabled);
        if (typeof data?.sunday === "boolean") setNoteSunday(data.sunday);
        else if (typeof data?.enabled === "boolean") setNoteSunday(data.enabled);
        if (typeof data?.canSend === "boolean") {
          setMorningCanSend(data.canSend);
        }
        }
      )
      .catch(() => {});
    return () => {
      ctrl.abort();
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
      later(() => setTierSaved(false), 2000);
    } catch {
      /* localStorage already has it */
    }
  }, [later]);

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
      later(() => setKnowsOptionsSaved(false), 2000);
    } catch {
      /* localStorage already has it */
    }
  }, [later]);

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
      if (!res.ok) throw new Error(plainError(data.error, "Couldn't save your profile."));
      setProfileMsg("Saved. This is how you appear in communities.");
      await refresh();
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : "Couldn't save your profile.");
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
        throw new Error(plainError(data.error, "Couldn't download your data."));
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
      setExportErr(err instanceof Error ? err.message : "Couldn't download your data.");
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
      if (!res.ok) throw new Error(plainError(data.error, "Couldn't delete your account."));
      await signOut();
      router.push(data.authDeleted ? "/?accountDeleted=full" : "/?accountDeleted=data");
    } catch (err) {
      setDeleteErr(err instanceof Error ? err.message : "Couldn't delete your account.");
      setDeleting(false);
    }
  }

  return (
    <SignInGate>
      <div className={PAGE_FRAME_CLASS}>
        <MobileChrome title="Account" active="settings" />
        <AppHeader className="hidden md:block" title="Account">
          <button
            type="button"
            onClick={() =>
              void signOut().then(() => {
                router.push("/");
              })
            }
            className="touch-target inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted hover:border-brand hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </AppHeader>

        <main id="main" className={PAGE_MAIN_CLASS}>
          <div>
            <h1 className="text-lg font-bold">My account</h1>
            <p className="mt-1 text-sm text-muted">
              How you appear, your data, and the danger zone.
            </p>
          </div>

          <WidgetErrorBoundary name="Account">
          <VisitStreakCard />

          <section className="space-y-3 rounded-2xl border border-border bg-card/80 p-4 sm:p-5">
            <h2 className="text-base font-bold text-foreground">Email notes</h2>
            <p className="text-sm text-muted">
              {morningCanSend
                ? "Sunday is on. Weekdays and the after-close recap are extra if you want them."
                : "Notes also land in the app. Email is not set up on this server yet."}
            </p>
            {(
              [
                {
                  id: "morning",
                  checked: noteMorning,
                  set: setNoteMorning,
                  label:
                    "Weekdays. What to watch before the open, then a recap after the US close.",
                },
                {
                  id: "sunday",
                  checked: noteSunday,
                  set: setNoteSunday,
                  label:
                    "Sundays. The week that just finished, and what to think about next.",
                },
              ] as const
            ).map((row) => (
              <label
                key={row.id}
                className="flex items-center gap-2 text-sm text-foreground"
              >
                <input
                  type="checkbox"
                  checked={row.checked}
                  onChange={(e) => {
                    const next = e.target.checked;
                    const prev = row.checked;
                    row.set(next);
                    void fetch("/api/account/morning-note", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(
                        row.id === "morning"
                          ? { morning: next }
                          : { sunday: next }
                      ),
                    })
                      .then((r) => {
                        if (r.ok) {
                          setMorningSaved(true);
                          later(() => setMorningSaved(false), 2000);
                          return;
                        }
                        row.set(prev);
                      })
                      .catch(() => {
                        row.set(prev);
                      });
                  }}
                  className="h-4 w-4 rounded border-brand-mid bg-well text-brand focus:ring-brand/50"
                />
                {row.label}
              </label>
            ))}
            {morningSaved && (
              <p className="text-sm text-gain">Saved.</p>
            )}
          </section>

          {/* Profile / community appearance */}
          <section className="space-y-4 rounded-2xl border border-border bg-card/80 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-hover text-foreground/80">
                <UserRound className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Community profile
                </h2>
                <p className="text-sm text-muted">
                  Signed in as {user?.email ?? "—"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border bg-well/60 px-3 py-3">
              {avatarUrl && !avatarBroken ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  onError={() => setAvatarBroken(true)}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-hover text-sm font-semibold text-foreground">
                  {(displayName || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {displayName || "Your name"}
                </p>
                <p className="truncate text-sm text-muted">
                  {bio || "Add a short bio for the community scoreboard."}
                </p>
              </div>
            </div>

            <form onSubmit={(e) => void saveProfile(e)} className="space-y-3">
              <label className="block space-y-1">
                <span className="text-sm text-muted">
                  Display name
                </span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={80}
                  className="w-full rounded-lg border border-border bg-well px-3 py-2.5 text-sm"
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="flex items-baseline justify-between">
                  <span className="text-sm text-muted">
                    Bio · communities
                  </span>
                  <span className="text-sm tabular-nums text-muted">
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
                  className="w-full resize-none rounded-lg border border-border bg-well px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-muted">
                  Avatar URL (optional)
                </span>
                <input
                  value={avatarUrl}
                  onChange={(e) => {
                    setAvatarUrl(e.target.value);
                    setAvatarBroken(false);
                  }}
                  placeholder="https://…"
                  className="w-full rounded-lg border border-border bg-well px-3 py-2.5 text-sm"
                />
                {avatarBroken && (
                  <span className="text-sm text-loss">
                    Couldn&apos;t load that image, showing your initial instead.
                  </span>
                )}
              </label>
              {profileErr && (
                <p className="text-sm text-loss">{profileErr}</p>
              )}
              {profileMsg && (
                <p className="text-sm text-gain">{profileMsg}</p>
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
          <section className="space-y-3 rounded-2xl border border-border bg-card/80 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-hover text-foreground/80">
                <Gauge className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Experience level</h2>
                <p className="text-sm text-muted">
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
                      ? "border-white/25 bg-hover text-foreground"
                      : "border-border bg-well/60 text-foreground/80 hover:border-brand-mid"
                  )}
                >
                  <span>
                    <span className="font-medium">{t.label}</span>
                    <span className="mt-0.5 block text-sm text-muted">{t.blurb}</span>
                  </span>
                  {tier === t.id && <Check className="h-4 w-4 shrink-0 text-foreground" />}
                </button>
              ))}
            </div>
            {tierSaved && <p className="text-sm text-gain">Saved.</p>}

            <div className="mt-4 border-t border-border pt-4">
              <p className="text-sm font-medium text-foreground">Options experience</p>
              <p className="mt-0.5 text-sm text-muted">
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
                      ? "border-white/25 bg-hover text-foreground"
                      : "border-border bg-well/60 text-foreground/80 hover:border-brand-mid"
                  )}
                >
                  <span className="font-medium">Yes</span>
                  <span className="mt-0.5 block text-sm text-muted">
                    Show covered calls
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleKnowsOptionsChange(false)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left text-sm transition",
                    knowsOptions === false
                      ? "border-white/25 bg-hover text-foreground"
                      : "border-border bg-well/60 text-foreground/80 hover:border-brand-mid"
                  )}
                >
                  <span className="font-medium">No</span>
                  <span className="mt-0.5 block text-sm text-muted">
                    Hide options entirely
                  </span>
                </button>
              </div>
              {knowsOptionsSaved && <p className="mt-2 text-sm text-gain">Saved.</p>}
            </div>
          </section>

          {/* Sheet invites live next to the sheet, not here. */}
          <section className="space-y-3 rounded-2xl border border-border bg-card/80 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-hover text-foreground/80">
                <Link2 className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Invite a partner
                </h2>
                <p className="text-sm text-muted">
                  That lives on the sheet now. Open a book, tap Invite next to
                  Add holding.
                </p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              Redeem a code at{" "}
              <Link href="/account/join" className="text-foreground underline">
                /account/join
              </Link>
              .
            </p>
          </section>

          {/* Data & privacy */}
          <section className="space-y-4 rounded-2xl border border-border bg-card/80 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-hover text-foreground/80">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">
                  Data &amp; privacy
                </h2>
                <p className="text-sm text-muted">
                  Your data, your call. Export it or wipe it any time.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-well/60 px-3 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Download everything
                </p>
                <p className="text-sm text-muted">
                  One JSON file: profile, sheets, holdings, Lab state.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void exportData()}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:border-brand disabled:opacity-60"
              >
                <Download className="h-3.5 w-3.5" />
                {exporting ? "Preparing …" : "Export my data"}
              </button>
            </div>
            {exportErr && <p className="text-sm text-loss">{exportErr}</p>}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-loss/40 bg-loss/10 px-3 py-3">
              <div>
                <p className="text-sm font-medium text-loss">
                  Delete my account
                </p>
                <p className="text-sm text-muted">
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
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-loss/40 px-3 py-2 text-sm font-medium text-loss hover:bg-loss/10"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Delete account
              </button>
            </div>

            <p className="text-center text-sm text-muted">
              <Link href="/privacy" className="underline hover:text-muted">
                Privacy policy
              </Link>
              {" · "}
              <Link href="/terms" className="underline hover:text-muted">
                Terms of service
              </Link>
            </p>
          </section>
          </WidgetErrorBoundary>
        </main>
        <BookBottomNav />
      </div>

      {deleteOpen && (
        <ViewportOverlay className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => !deleting && setDeleteOpen(false)}
          />
          <div className="relative max-h-full w-full overflow-y-auto rounded-t-2xl border border-loss/50 bg-well p-5 shadow-2xl sm:max-w-md sm:rounded-2xl">
            <h3 className="text-base font-semibold text-loss">
              Delete your account?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              This permanently deletes your profile and any sheet you&apos;re
              the sole owner of (holdings included). Shared sheets stay for
              your co-owner. Where possible this also removes your sign-in
              itself, so the account can&apos;t be used again; if it can&apos;t
              be removed from here, revoke Upside Lab&apos;s access from your
              Google account separately if you want that severed too.
            </p>
            <label className="mt-4 block space-y-1">
              <span className="text-sm text-muted">
                Type DELETE to confirm
              </span>
              <input
                autoFocus
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder="DELETE"
                className="w-full rounded-lg border border-loss/60 bg-well px-3 py-2.5 text-sm text-foreground outline-none focus:border-loss"
              />
            </label>
            {deleteErr && (
              <p className="mt-3 text-sm text-loss">{deleteErr}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-well hover:text-foreground disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void deleteAccount()}
                disabled={deleting || deleteText.trim() !== "DELETE"}
                className="rounded-lg bg-loss px-4 py-2 text-sm font-semibold text-paper hover:bg-loss/80 disabled:opacity-40"
              >
                {deleting ? "Deleting …" : "Permanently delete"}
              </button>
            </div>
          </div>
        </ViewportOverlay>
      )}
    </SignInGate>
  );
}
