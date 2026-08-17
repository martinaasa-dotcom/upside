"use client";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { isSuperadminEmail } from "@/lib/auth/superadmin";
import { cn } from "@/lib/format";
import { BookOpen, Bot, Shield, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Rooms you leave the book for. Icons on phones, labels from md up
 * so the header doesn't overflow.
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
    <Button
      asChild
      variant={active ? "default" : "ghost"}
      size="sm"
      className={cn(active && "bg-primary text-primary-foreground")}
    >
      <Link
        href={href}
        prefetch
        title={title}
        aria-label={label}
        aria-current={active ? "page" : undefined}
      >
        <Icon className="h-4 w-4 md:h-3.5 md:w-3.5" />
        <span className="hidden md:inline">{label}</span>
      </Link>
    </Button>
  );

  return (
    <nav
      aria-label="Upside Lab rooms"
      className={cn("inline-flex max-w-full items-center gap-2", className)}
    >
      {item(onBook, "/", "Portfolio", "Your portfolios and daily briefing", BookOpen)}
      {item(onFund, "/upside-portfolio", "Fund", "Upside Fund, the paper portfolio Margus runs", Bot)}
      {item(onCommunities, "/communities", "Circle", "Compare portfolios with people you know", Users)}
      {showAdmin ? item(onAdmin, "/admin", "Admin", "Admin", Shield) : null}
    </nav>
  );
}
