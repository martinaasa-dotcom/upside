"use client";

import { cn } from "@/lib/format";
import { BookOpen, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Primary workspace switcher: My book ↔ Communities.
 * Equal weight so communities aren’t a buried header chip.
 */
export function WorkspaceSwitcher({ className }: { className?: string }) {
  const pathname = usePathname();
  const onCommunities = pathname.startsWith("/communities");
  const onBook = !onCommunities;

  return (
    <nav
      aria-label="Workspace"
      className={cn(
        "inline-flex rounded-lg border border-brand-deep/40 bg-zinc-950/60 p-0.5",
        className
      )}
    >
      <Link
        href="/"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition sm:px-3",
          onBook
            ? "bg-brand/20 text-brand-bright shadow-sm shadow-black/20"
            : "text-zinc-500 hover:text-zinc-300"
        )}
      >
        <BookOpen className="h-3.5 w-3.5" />
        <span>My book</span>
      </Link>
      <Link
        href="/communities"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition sm:px-3",
          onCommunities
            ? "bg-brand/20 text-brand-bright shadow-sm shadow-black/20"
            : "text-zinc-500 hover:text-zinc-300"
        )}
      >
        <Users className="h-3.5 w-3.5" />
        <span>Communities</span>
      </Link>
    </nav>
  );
}
