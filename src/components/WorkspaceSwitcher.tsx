"use client";

import { useAuth } from "@/components/AuthProvider";
import { isSuperadminEmail } from "@/lib/auth/superadmin";
import { cn } from "@/lib/format";
import { BookOpen, Bot, Shield, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Rooms you leave the book for. Labels stay visible so a first visit
 * is not a row of mystery icons.
 */
export function WorkspaceSwitcher({ className }: { className?: string }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const showAdmin = isSuperadminEmail(user?.email);
  const onCommunities = pathname.startsWith("/communities");
  const onFund = pathname.startsWith("/upside-portfolio");
  const onAccount = pathname.startsWith("/account");
  const onAdmin = pathname.startsWith("/admin");
  const onBook = !onCommunities && !onFund && !onAccount && !onAdmin;

  const item = (
    active: boolean,
    href: string,
    label: string,
    title: string,
    Icon: typeof BookOpen
  ) => (
    <Link
      href={href}
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition sm:px-2.5",
        active
          ? "bg-brand/20 text-brand-bright shadow-sm shadow-black/20"
          : "text-zinc-400 hover:text-zinc-300"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </Link>
  );

  return (
    <nav
      aria-label="Upside rooms"
      className={cn(
        "inline-flex max-w-[min(100%,22rem)] overflow-x-auto rounded-lg border border-brand-deep/40 bg-zinc-950/60 p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {item(onBook, "/", "Book", "Your sheets and daily briefing", BookOpen)}
      {item(onFund, "/upside-portfolio", "Fund", "Upside Fund, the paper book Margus runs", Bot)}
      {item(onCommunities, "/communities", "Communities", "Compare books with people you know", Users)}
      {item(onAccount, "/account", "Account", "You, your data, danger zone", UserRound)}
      {showAdmin ? item(onAdmin, "/admin", "Admin", "Admin", Shield) : null}
    </nav>
  );
}
