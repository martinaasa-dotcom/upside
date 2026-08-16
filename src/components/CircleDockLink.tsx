"use client";

import { cn } from "@/lib/format";
import { Compass } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Circle chip for the book dock. Sits off the Overview/Pulse/Lab/Compound cluster. */
export function CircleDockLink({ className }: { className?: string }) {
  const pathname = usePathname();
  const on =
    pathname.startsWith("/communities") ||
    pathname.startsWith("/upside-portfolio");
  return (
    <Link
      href="/communities"
      title="Upside Circle"
      aria-current={on ? "page" : undefined}
      className={cn(
        "flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-medium ring-1 ring-inset transition",
        on
          ? "bg-select text-select-ink ring-select"
          : "bg-well/80 text-muted ring-brand/30 hover:text-brand-bright",
        className
      )}
    >
      <Compass className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
      Circle
    </Link>
  );
}
