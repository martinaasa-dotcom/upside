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
 * First-screen showcase for communities after sign-in — sits on Overview
 * so the circle is as visible as the personal book.
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

  if (communities === null) {
    return (
      <div
        className={cn(
          "h-[4.5rem] animate-pulse rounded-2xl border border-brand-deep/20 bg-brand/5",
          className
        )}
        aria-hidden
      />
    );
  }

  const primary = communities[0];

  return (
    <section
      className={cn(
        "overview-fade relative overflow-hidden rounded-2xl border border-brand-mid/35 bg-gradient-to-br from-brand/20 via-[#1a1610] to-[#161618] p-4 sm:p-5",
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-brand/20 blur-3xl"
      />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-mid/40 bg-brand/15 text-brand-bright">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-bright/90">
              Communities
            </p>
            {primary ? (
              <>
                <h2 className="mt-0.5 truncate text-lg font-semibold tracking-tight text-white">
                  {primary.name}
                </h2>
                <p className="mt-0.5 text-sm text-zinc-400">
                  Live books from every member · read-only rivalry
                  {communities.length > 1
                    ? ` · +${communities.length - 1} more`
                    : ""}
                </p>
              </>
            ) : (
              <>
                <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-white">
                  Join the circle
                </h2>
                <p className="mt-0.5 text-sm text-zinc-400">
                  See everyone’s book in one place — invite partners when you’re
                  ready.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {primary ? (
            <Link
              href={`/communities/${primary.id}`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-bright px-4 text-sm font-semibold text-[#1a1510] transition hover:bg-[#F0E4C8]"
            >
              Open {primary.name}
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
          <Link
            href="/communities"
            className={cn(
              "inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition",
              primary
                ? "border-brand-mid/40 text-brand-bright hover:border-brand-mid/70 hover:bg-brand/10"
                : "border-brand-mid/50 bg-brand/15 text-brand-bright hover:bg-brand/25"
            )}
          >
            {primary ? "All communities" : "Browse communities"}
            {!primary && <ArrowRight className="h-4 w-4" />}
          </Link>
        </div>
      </div>
    </section>
  );
}
