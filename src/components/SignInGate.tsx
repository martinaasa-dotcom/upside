"use client";

import { useAuth } from "@/components/AuthProvider";
import { DashboardLoading } from "@/components/DashboardLoading";
import { UpsideLogo } from "@/components/UpsideLogo";
import { Metric, MicroLabel, Panel, Pill, Reading } from "@/components/ui/Panel";
import { cn } from "@/lib/format";
import { CheckCircle2 } from "lucide-react";
import {
  inviteFromLocation,
  inviteLandingCopy,
  type InviteLanding,
} from "@/lib/invite-landing";
import {
  PRODUCT_NAME,
  PRODUCT_SENTENCE,
  SIGNIN_POINTS,
  SIGNIN_WHO,
} from "@/lib/product";
import { supabaseIsConfigured } from "@/lib/supabase/env";
import { pickLoadingMessage } from "@/lib/loading-messages";
import Link from "next/link";
import { useEffect, useState } from "react";

type Props = {
  children: React.ReactNode;
};

/**
 * Requires Google SSO when Supabase is configured.
 * Demo / no-Supabase local mode renders children immediately.
 */
export function SignInGate({ children }: Props) {
  const { ready, user, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Plain browser API instead of useSearchParams() — this page is statically
  // rendered, and useSearchParams() would force a Suspense boundary / opt it
  // into dynamic rendering just to show a one-time post-deletion notice.
  const [deletedNotice, setDeletedNotice] = useState<"full" | "data" | null>(
    null
  );
  const [loadingMessage] = useState(pickLoadingMessage);
  const [invite, setInvite] = useState<InviteLanding | null>(null);
  const needsAuth = supabaseIsConfigured();

  useEffect(() => {
    const url = new URL(window.location.href);
    const kind = url.searchParams.get("accountDeleted");
    if (kind === "full" || kind === "data") {
      setDeletedNotice(kind);
      url.searchParams.delete("accountDeleted");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}`
      );
    }

    const fromUrl = inviteFromLocation(url.pathname, url.search);
    if (!fromUrl) return;
    setInvite(fromUrl);
    if (fromUrl.kind === "sheet") return;
    const token = url.searchParams.get("token")?.trim();
    if (!token) return;
    const ctrl = new AbortController();
    void fetch(`/api/communities/join?token=${encodeURIComponent(token)}`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || ctrl.signal.aborted) return;
        const kind =
          data.kind === "classroom" ? "classroom" : "community";
        setInvite({
          kind,
          name: typeof data.name === "string" ? data.name : null,
        });
      })
      .catch(() => {
        /* keep the generic invite line */
      });
    return () => ctrl.abort();
  }, []);

  if (!needsAuth) return <>{children}</>;
  if (!ready) return <DashboardLoading message={loadingMessage} />;
  if (user) return <>{children}</>;

  async function onSignIn() {
    setErr(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-app text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 20% 0%, #1c1814 0%, transparent 58%), radial-gradient(ellipse 45% 40% at 92% 88%, rgba(214,173,105,0.07) 0%, transparent 52%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <main
        id="main"
        className="relative z-10 mx-auto flex w-full min-w-0 max-w-5xl flex-1 flex-col justify-center px-6 py-[max(2.5rem,env(safe-area-inset-top))] pb-[max(3.5rem,env(safe-area-inset-bottom))] md:px-10"
      >
        <div className="signin-rise grid items-center gap-14 md:grid-cols-[minmax(0,1fr)_26rem] md:gap-16 lg:gap-20">
          <div className="flex flex-col items-center text-center md:items-start md:text-left">
            <UpsideLogo variant="icon" className="signin-rise-1 text-lg" />

            {deletedNotice && (
              <p className="signin-rise-2 mt-8 max-w-md rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm leading-relaxed text-emerald-200">
                {deletedNotice === "full"
                  ? "Account deleted. Your data and sign-in are both gone."
                  : `Your ${PRODUCT_NAME} data has been deleted. Signing in again starts a brand-new account.`}
              </p>
            )}

            <div className="signin-rise-2 mt-10 max-w-md space-y-4">
              {invite && (
                <p className="text-xs font-medium text-brand-bright">
                  Invite
                </p>
              )}
              <h1 className="font-heading text-lg font-bold leading-snug text-white">
                {invite ? inviteLandingCopy(invite).title : PRODUCT_SENTENCE}
              </h1>
              <p className="text-sm leading-relaxed text-zinc-400">
                {invite ? inviteLandingCopy(invite).detail : SIGNIN_WHO}
              </p>
            </div>

            <ul className="signin-rise-2 mt-8 max-w-md space-y-3.5 text-left text-sm leading-relaxed text-zinc-400">
              {SIGNIN_POINTS.map((line) => (
                <li key={line} className="flex gap-3">
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-bright"
                    aria-hidden
                  />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              disabled={busy}
              onClick={() => void onSignIn()}
              className="btn-primary signin-rise-3 mt-10 h-12 w-full max-w-sm rounded-xl gap-2.5 md:w-auto md:min-w-[17rem]"
            >
              <GoogleMark />
              {busy ? "Redirecting …" : "Continue with Google"}
            </button>

            {err && (
              <p className="mt-4 text-xs text-red-400" role="alert">
                {err}
              </p>
            )}

            <p className="signin-rise-4 mt-6 max-w-sm text-xs leading-relaxed text-zinc-500">
              By continuing you agree to the{" "}
              <Link href="/terms" className="underline hover:text-zinc-400">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline hover:text-zinc-400">
                Privacy policy
              </Link>
              . Not financial advice.
            </p>
          </div>

          <BookStill />
        </div>
      </main>
    </div>
  );
}

const SAMPLE_MOVERS = [
  { ticker: "RKLB", pct: "+6.8%", dollar: "+$3,640", up: true },
  { ticker: "AMZN", pct: "+1.4%", dollar: "+$720", up: true },
  { ticker: "MSFT", pct: "-0.6%", dollar: "-$180", up: false },
] as const;

/** Static chrome of a day that moved. Sample figures, written like Home + Pulse. */
function BookStill() {
  return (
    <Panel className="signin-rise-3 hidden h-auto md:block" aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <MicroLabel className="text-brand-bright/80">
          Today&apos;s briefing
        </MicroLabel>
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-zinc-500">
          Sample
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Metric label="Book">$91,400</Metric>
        <Metric label="Today" valueClassName="text-gain">
          +$4,180
        </Metric>
        <Metric label="All time" valueClassName="text-gain">
          +18%
        </Metric>
      </div>

      <div className="mt-6 space-y-2">
        {SAMPLE_MOVERS.map((row) => (
          <div
            key={row.ticker}
            className="relative grid grid-cols-[1fr_auto] items-center gap-3 overflow-hidden rounded-xl border border-border bg-card py-3 pl-5 pr-4"
          >
            <span
              className={cn(
                "absolute inset-y-0 left-0 w-0.5",
                row.up ? "bg-gain" : "bg-loss"
              )}
              aria-hidden
            />
            <span className="font-heading text-base font-bold text-white">
              ${row.ticker}
            </span>
            <span className="text-right">
              <span
                className={cn(
                  "block font-sans text-base font-semibold tabular-nums",
                  row.up ? "text-gain" : "text-loss"
                )}
              >
                {row.pct}
              </span>
              <span
                className={cn(
                  "mt-0.5 block text-sm tabular-nums",
                  row.up ? "text-gain" : "text-loss"
                )}
              >
                {row.dollar}
              </span>
            </span>
          </div>
        ))}
      </div>

      <Reading className="mt-5" label="Worth noticing">
        $RKLB jumped 6.8% today. Amazon and Microsoft barely moved.
      </Reading>

      <div className="mt-3 rounded-xl border border-brand/30 bg-brand/[0.07] px-3.5 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-white">$RKLB</span>
              <span className="rounded-lg bg-gain/15 px-1.5 py-0.5 text-xs font-medium text-gain">
                Up ≥5%
              </span>
            </div>
            <p className="mt-1 font-sans text-sm font-semibold tabular-nums text-gain">
              +6.8%{" "}
              <span className="font-normal text-zinc-400">today</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Pill>Hold</Pill>
            <Pill tone="good">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Thesis intact
            </Pill>
          </div>
        </div>
        <Reading className="mt-3" label="Thesis">
          Cheaper launches. That&apos;s why it&apos;s in the book.
        </Reading>
      </div>
    </Panel>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-0.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
