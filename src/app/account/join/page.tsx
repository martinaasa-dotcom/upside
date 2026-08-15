"use client";

import { track } from "@vercel/analytics";
import { useAuth } from "@/components/AuthProvider";
import { plainError } from "@/lib/plain-error";
import { SignInGate } from "@/components/SignInGate";
import { UpsideLogo } from "@/components/UpsideLogo";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function JoinInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { ready, user } = useAuth();
  const code =
    params.get("code")?.trim() || params.get("token")?.trim() || "";
  const [manual, setManual] = useState(code);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(
    code ? "Accepting invite …" : null
  );

  async function accept(inviteCode: string) {
    setError(null);
    setStatus("Accepting invite …");
    try {
      const res = await fetch("/api/portfolios/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(plainError(data.error, "Couldn't join. Try the link again."));
      track("portfolio_invite_redeemed");
      setStatus(
        data.portfolio?.name
          ? `Joined ${data.portfolio.name}, opening My book …`
          : "Joined, opening My book …"
      );
      router.replace("/");
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : "Couldn't join. Try the link again.");
    }
  }

  useEffect(() => {
    if (!ready || !user || !code) return;
    void accept(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, code]);

  return (
    <SignInGate>
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[radial-gradient(ellipse_at_top,_#100e0a_0%,_#08090C_55%)] px-4 text-zinc-100">
        <UpsideLogo variant="icon" className="mb-2" />
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-lg font-bold">Join a portfolio</h1>
          <p className="text-sm text-zinc-400">
            Enter an invite code from your partner to get live edit access.
          </p>
          {!code && (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (manual.trim()) void accept(manual.trim());
              }}
            >
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="Paste invite code"
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm"
              />
              <button
                type="submit"
                className="btn-primary py-2.5"
              >
                Join sheet
              </button>
            </form>
          )}
          {status && <p className="text-sm text-zinc-400">{status}</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </SignInGate>
  );
}

export default function AccountJoinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-app text-zinc-400">
          Loading …
        </div>
      }
    >
      <JoinInner />
    </Suspense>
  );
}
