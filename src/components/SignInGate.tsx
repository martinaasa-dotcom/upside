"use client";

import { useAuth } from "@/components/AuthProvider";
import { UpsideLogo } from "@/components/UpsideLogo";
import {
  PRODUCT_BLURB,
  PRODUCT_NAME,
  PRODUCT_SENTENCE,
  SIGNIN_POINTS,
  SIGNIN_WHO,
} from "@/lib/product";
import { supabaseIsConfigured } from "@/lib/supabase/env";
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
  const needsAuth = supabaseIsConfigured();

  useEffect(() => {
    const kind = new URLSearchParams(window.location.search).get(
      "accountDeleted"
    );
    if (kind === "full" || kind === "data") {
      setDeletedNotice(kind);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  if (!needsAuth) return <>{children}</>;
  if (!ready) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-app px-6">
        <UpsideLogo variant="stack" />
        <p className="sr-only" role="status">
          Checking sign-in
        </p>
      </div>
    );
  }
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
            "radial-gradient(ellipse 90% 70% at 50% -10%, #1a1612 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 80% 110%, rgba(214,173,105,0.06) 0%, transparent 50%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-[max(2rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))] md:px-8">
        <div className="signin-rise grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_16.5rem] md:gap-12">
          <div className="flex flex-col items-center text-center md:items-start md:text-left">
            <UpsideLogo variant="icon" className="signin-rise-1 mb-8" />

            {deletedNotice && (
              <p className="signin-rise-2 mb-4 max-w-sm rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm leading-relaxed text-emerald-200">
                {deletedNotice === "full"
                  ? "Account deleted. Your data and sign-in are both gone."
                  : `Your ${PRODUCT_NAME} data has been deleted. Signing in again starts a brand-new account.`}
              </p>
            )}

            <p className="signin-rise-2 max-w-md text-base font-medium leading-snug text-zinc-100">
              {PRODUCT_SENTENCE}
            </p>
            <p className="signin-rise-2 mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
              {PRODUCT_BLURB}
            </p>
            <p className="signin-rise-2 mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
              {SIGNIN_WHO}
            </p>

            <ul className="signin-rise-2 mt-5 max-w-md space-y-2 text-left text-sm leading-relaxed text-zinc-400">
              {SIGNIN_POINTS.map((line) => (
                <li key={line} className="flex gap-2">
                  <span
                    className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-bright/80"
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
              className="btn-primary signin-rise-3 mt-8 h-12 w-full max-w-sm rounded-full gap-2.5 md:w-auto md:min-w-[16rem]"
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
              . Not financial advice. Communities stay read-only for everyone
              else.
            </p>
          </div>

          <BookStill />
        </div>
      </main>
    </div>
  );
}

/** Static chrome of the daily read. Labels only, no fake P&L. */
function BookStill() {
  return (
    <div
      className="signin-rise-3 hidden w-full rounded-2xl border border-white/10 bg-card/80 p-4 md:block"
      aria-hidden
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-bright/80">
        Today’s briefing
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {["Book", "Today", "All time"].map((label) => (
          <div
            key={label}
            className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-2 py-2"
          >
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="mt-1 h-2.5 w-10 rounded-sm bg-zinc-700/80" />
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-brand/25 bg-brand/10 px-3 py-2.5">
        <p className="text-xs font-medium text-brand-bright">Look at this</p>
        <p className="mt-1 text-xs leading-snug text-zinc-200">
          Check the thesis on names that moved.
        </p>
      </div>
      <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5">
        <p className="text-xs font-medium text-zinc-500">Note</p>
        <p className="mt-1 text-xs leading-snug text-zinc-400">
          What moved, in a few lines. Then ask Margus if you want.
        </p>
      </div>
    </div>
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
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
