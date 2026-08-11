"use client";

import { cn } from "@/lib/format";
import { BookOpen, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Primary workspace switcher: My book · Communities · Account.
 */
export function WorkspaceSwitcher({ className }: { className?: string }) {
  const pathname = usePathname();
  const onCommunities = pathname.startsWith("/communities");
  const onAccount = pathname.startsWith("/account");
  const onBook = !onCommunities && !onAccount;

  const item = (
    active: boolean,
    href: string,
    label: string,
    Icon: typeof BookOpen
  ) => (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition sm:px-2.5",
        active
          ? "bg-brand/20 text-brand-bright shadow-sm shadow-black/20"
          : "text-zinc-500 hover:text-zinc-300"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden xs:inline sm:inline">{label}</span>
    </Link>
  );

  return (
    <nav
      aria-label="Workspace"
      className={cn(
        "inline-flex rounded-lg border border-brand-deep/40 bg-zinc-950/60 p-0.5",
        className
      )}
    >
      {item(onBook, "/", "My book", BookOpen)}
      {item(onCommunities, "/communities", "Communities", Users)}
      {item(onAccount, "/account", "Account", UserRound)}
    </nav>
  );
}
