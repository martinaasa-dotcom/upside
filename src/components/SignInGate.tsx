"use client";

import { useAuth } from "@/components/AuthProvider";
import { UpsideLogo } from "@/components/UpsideLogo";
import { PRODUCT_BLURB, PRODUCT_SENTENCE } from "@/lib/product";
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
  const needsAuth = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

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
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[radial-gradient(ellipse_at_top,_#1f1a12_0%,_#121214_55%)] text-zinc-400">
        <UpsideLogo
          variant="mark"
          className="h-10 w-10 animate-pulse opacity-70"
        />
        <p className="text-sm text-zinc-400">Checking sign-in …</p>
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
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#121214] text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% -10%, #2a2218 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 80% 110%, rgba(212,184,122,0.08) 0%, transparent 50%)",
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

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-[max(4rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
        <div className="signin-rise flex w-full max-w-[18.5rem] -translate-y-4 flex-col items-center text-center sm:-translate-y-6">
          <UpsideLogo variant="icon" className="signin-rise-1 mb-9" />

          {deletedNotice && (
            <p className="signin-rise-2 mb-4 max-w-[16rem] rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[13px] leading-relaxed text-emerald-200">
              {deletedNotice === "full"
                ? "Account deleted. Your data and sign-in are both gone."
                : "Your Upside data has been deleted. Signing in again starts a brand-new account."}
            </p>
          )}

          <p className="signin-rise-2 max-w-[17rem] text-[15px] font-medium leading-snug text-zinc-200">
            {PRODUCT_SENTENCE}
          </p>
          <p className="signin-rise-2 mt-2.5 max-w-[15.5rem] text-[13px] leading-relaxed text-zinc-400">
            {PRODUCT_BLURB} Sign in to open the sheets you own.
          </p>

          <button
            type="button"
            disabled={busy}
            onClick={() => void onSignIn()}
            className="signin-rise-3 mt-9 inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-lg border border-brand-mid/40 bg-brand-bright px-4 text-[14px] font-semibold text-[#1a1510] shadow-[0_12px_40px_-12px_rgba(212,184,122,0.5)] transition hover:bg-[#F0E4C8] hover:shadow-[0_16px_48px_-12px_rgba(212,184,122,0.6)] active:scale-[0.985] disabled:opacity-60"
          >
            <GoogleMark />
            {busy ? "Redirecting …" : "Continue with Google"}
          </button>

          {err && (
            <p className="mt-4 text-xs text-red-400" role="alert">
              {err}
            </p>
          )}

          <p className="signin-rise-4 mt-8 text-xs leading-relaxed text-zinc-400">
            Communities stay read-only for everyone else.
          </p>

          <p className="signin-rise-4 mt-3 text-xs leading-relaxed text-zinc-400">
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
      </main>
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
