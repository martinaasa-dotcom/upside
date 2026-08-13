"use client";

import { track } from "@vercel/analytics";
import { SignInGate } from "@/components/SignInGate";
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
      setError("Missing invite token");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/communities/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Join failed");
        if (cancelled) return;
        track("community_invite_redeemed");
        setDone(true);
        router.replace(`/communities/${data.communityId}`);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Join failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <SignInGate>
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#121214] px-4 text-zinc-100">
        <UpsideLogo variant="mark" className="h-10 w-10" />
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : done ? (
          <p className="text-sm text-zinc-400">Joined — redirecting …</p>
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
        <div className="flex min-h-dvh items-center justify-center bg-[#121214] text-zinc-400">
          Loading …
        </div>
      }
    >
      <JoinInner />
    </Suspense>
  );
}
