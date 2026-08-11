"use client";

import { useAuth } from "@/components/AuthProvider";
import { UpsideLogo } from "@/components/UpsideLogo";

type Props = {
  /** Guest share links skip the gate. */
  bypass?: boolean;
  children: React.ReactNode;
};

/**
 * Requires Google SSO when Supabase is configured.
 * Demo / no-Supabase local mode renders children immediately.
 */
export function SignInGate({ bypass, children }: Props) {
  const { ready, user, signInWithGoogle } = useAuth();
  const needsAuth = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  if (bypass || !needsAuth) return <>{children}</>;
  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#121214] text-zinc-400">
        Loading…
      </div>
    );
  }
  if (user) return <>{children}</>;

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#121214] px-6 text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(52,211,153,0.18), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(56,189,248,0.08), transparent)",
        }}
      />
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8 text-center">
        <UpsideLogo className="h-12 w-auto" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Your book</h1>
          <p className="text-sm text-zinc-400">
            Sign in with Google to open the portfolios you own. Communities stay
            read-only for everyone else.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100"
        >
          <GoogleMark />
          Continue with Google
        </button>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.1 4 9.2 8.5 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.9 26.8 37 24 37c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.1 39.5 16 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l.1.1 6.2 5.2C39.2 36.3 44 31 44 24c0-1.3-.1-2.5-.4-3.5z"
      />
    </svg>
  );
}
