"use client";

import { cn } from "@/lib/format";
import { ArrowRight, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type CommunityRow = {
  id: string;
  name: string;
  role: string;
};

/**
 * Quiet row on Overview. Communities live in the header workspace, so
 * this is a reminder, not a second hero.
 */
export function CommunitiesSpotlight({ className }: { className?: string }) {
  const [communities, setCommunities] = useState<CommunityRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/communities", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setCommunities([]);
          return;
        }
        const data = await res.json();
        if (!cancelled) setCommunities(data.communities ?? []);
      } catch {
        if (!cancelled) setCommunities([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (communities === null) return null;

  const primary = communities[0];
  const href = primary ? `/communities/${primary.id}` : "/communities";
  const label = primary
    ? communities.length > 1
      ? `${primary.name} and ${communities.length - 1} more`
      : primary.name
    : "Browse communities";

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-3.5 py-3 text-left transition hover:border-zinc-600 hover:bg-zinc-900/60",
        className
      )}
    >
      <Users className="h-4 w-4 shrink-0 text-brand-bright" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">
        {primary ? (
          <>
            <span className="text-zinc-400">Circle · </span>
            {label}
          </>
        ) : (
          "Invite someone, or join a public circle"
        )}
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
    </Link>
  );
}
