"use client";

import { track } from "@vercel/analytics";
import { SignInGate } from "@/components/SignInGate";
import { plainError } from "@/lib/plain-error";
import { UpsideLogo } from "@/components/UpsideLogo";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function JoinInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token")?.trim() ?? "";
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(
    token ? "Opening your invite …" : null
  );

  useEffect(() => {
    if (!token) {
      setError("That invite link is missing a code. Ask them to send it again.");
      return;
    }
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/communities/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            plainError(data.error, "Couldn't join. Try the link again.")
          );
        }
        if (ctrl.signal.aborted) return;
        track("community_invite_redeemed");
        const classroom = data.kind === "classroom";
        const label = typeof data.name === "string" ? data.name : null;
        setStatus(
          classroom
            ? label
              ? `You're in ${label}. Opening the class …`
              : "You're in the class. Opening it …"
            : label
              ? `You're in ${label}. Opening the circle …`
              : "You're in. Opening the circle …"
        );
        router.replace(`/communities/${data.communityId}`);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setStatus(null);
        setError(
          e instanceof Error ? e.message : "Couldn't join. Try the link again."
        );
      }
    })();
    return () => {
      ctrl.abort();
    };
  }, [token, router]);

  return (
    <SignInGate>
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-foreground">
        <UpsideLogo variant="mark" className="h-10 w-10" />
        <div className="flex flex-col w-full max-w-sm gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Join with an invite</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            A friend or a teacher sent this. Sign in with Google if you
            haven&apos;t yet. Then we put you in the circle or the class.
          </p>
          {error ? (
            <p className="text-sm text-loss">{error}</p>
          ) : status ? (
            <p className="text-sm text-muted-foreground">{status}</p>
          ) : null}
        </div>
      </div>
    </SignInGate>
  );
}

export default function JoinCommunityPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background text-muted-foreground">
          Loading …
        </div>
      }
    >
      <JoinInner />
    </Suspense>
  );
}
