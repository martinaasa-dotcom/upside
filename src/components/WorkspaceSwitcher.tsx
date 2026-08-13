"use client";

import { useAuth } from "@/components/AuthProvider";
import { isSuperadminEmail } from "@/lib/auth/superadmin";
import { cn } from "@/lib/format";
import { BookOpen, Bot, Shield, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Primary workspace switcher: My book · Upside Portfolio · Communities · Account · (Admin).
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
      <span className="hidden xs:inline">{label}</span>
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
      {item(onFund, "/upside-portfolio", "Fund", Bot)}
      {item(onCommunities, "/communities", "Communities", Users)}
      {item(onAccount, "/account", "Account", UserRound)}
      {showAdmin ? item(onAdmin, "/admin", "Admin", Shield) : null}
    </nav>
  );
}
