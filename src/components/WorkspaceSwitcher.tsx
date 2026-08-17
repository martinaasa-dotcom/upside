"use client";

import { useAuth } from "@/components/AuthProvider";
import { usePaperClass } from "@/components/PaperClassProvider";
import { isSuperadminEmail } from "@/lib/auth/superadmin";
import { cn } from "@/lib/format";
import { paperClassHomeHref } from "@/lib/paper-class-cache";
import { BookOpen, Bot, GraduationCap, Shield, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Rooms you leave the book for. Icons on phones, labels from md up
 * so the header doesn't overflow.
 */
export function WorkspaceSwitcher({ className }: { className?: string }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const paper = usePaperClass();
  const showAdmin = isSuperadminEmail(user?.email);
  const onCommunities = pathname.startsWith("/communities");
  const onFund = pathname.startsWith("/upside-portfolio");
  const onAccount = pathname.startsWith("/account");
  const onAdmin = pathname.startsWith("/admin");
  const onBook = !onCommunities && !onFund && !onAccount && !onAdmin;
  const classHref = paperClassHomeHref(paper.classIds);

  const item = (
    active: boolean,
    href: string,
    label: string,
    title: string,
    Icon: typeof BookOpen
  ) => (
    <Link
      href={href}
      prefetch
      title={title}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "touch-target inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-semibold transition md:h-auto md:min-h-0 md:min-w-0 md:px-3 md:py-1.5 md:justify-start",
        active
          ? "bg-select text-select-ink"
          : "text-muted hover:text-brand-bright"
      )}
    >
      <Icon className="h-4 w-4 md:h-3.5 md:w-3.5" />
      <span className="hidden md:inline">{label}</span>
    </Link>
  );

  return (
    <nav
      aria-label="Upside Lab rooms"
      className={cn(
        "inline-flex max-w-full overflow-x-auto rounded-lg border border-border bg-card px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {paper.only ? (
        item(onCommunities, classHref, "Class", "Your paper class", GraduationCap)
      ) : (
        <>
          {item(onBook, "/", "Portfolio", "Your portfolios and daily briefing", BookOpen)}
          {item(onFund, "/upside-portfolio", "Fund", "Upside Fund, the paper portfolio Margus runs", Bot)}
          {item(onCommunities, "/communities", "Circle", "Compare portfolios with people you know", Users)}
        </>
      )}
      {showAdmin ? item(onAdmin, "/admin", "Admin", "Admin", Shield) : null}
    </nav>
  );
}
