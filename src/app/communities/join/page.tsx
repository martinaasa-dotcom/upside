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
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("That invite link is missing a code.");
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
        if (!res.ok) throw new Error(plainError(data.error, "Couldn't join. Try the link again."));
        if (ctrl.signal.aborted) return;
        track("community_invite_redeemed");
        setDone(true);
        router.replace(`/communities/${data.communityId}`);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Couldn't join. Try the link again.");
      }
    })();
    return () => {
      ctrl.abort();
    };
  }, [token, router]);

  return (
    <SignInGate>
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-app px-4 text-zinc-100">
        <UpsideLogo variant="mark" className="h-10 w-10" />
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : done ? (
          <p className="text-sm text-zinc-400">Joined, redirecting …</p>
        ) : (
          <p className="text-sm text-zinc-400">Accepting invite …</p>
        )}
      </div>
    </SignInGate>
  );
}

export default function JoinCommunityPage() {
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
