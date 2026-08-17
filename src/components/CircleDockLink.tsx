"use client";

import { usePaperClass } from "@/components/PaperClassProvider";
import { cn } from "@/lib/format";
import { paperClassHomeHref } from "@/lib/paper-class-cache";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import {
  circleHref,
  lastCircleEventName,
} from "@/lib/workspace-rooms";
import { Compass, GraduationCap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function useCircleHref(): string {
  const paper = usePaperClass();
  const [href, setHref] = useHydratedCache(circleHref, "/communities");
  useEffect(() => {
    const sync = () => setHref(circleHref());
    window.addEventListener(lastCircleEventName(), sync);
    return () => window.removeEventListener(lastCircleEventName(), sync);
  }, [setHref]);
  if (paper.only) return paperClassHomeHref(paper.classIds);
  return href;
}

/** Circle cell inside the shared book dock well. Same size as the other tabs. */
export function CircleDockLink({
  className,
  hideOnPhone = false,
}: {
  className?: string;
  hideOnPhone?: boolean;
}) {
  const pathname = usePathname();
  const href = useCircleHref();
  const paper = usePaperClass();
  const on = pathname.startsWith("/communities");
  const label = paper.only ? "Class" : "Circle";
  const Icon = paper.only ? GraduationCap : Compass;
  return (
    <Link
      href={href}
      prefetch
      title={paper.only ? "Your paper class" : "Upside Circle"}
      aria-current={on ? "page" : undefined}
      className={cn(
        hideOnPhone ? "hidden sm:flex" : "flex",
        "h-full w-full min-h-0 min-w-0 flex-col items-center justify-center gap-0.5 px-1.5 text-sm font-medium transition sm:flex-row sm:gap-1.5 sm:px-2",
        on
          ? "bg-select text-select-ink"
          : "text-muted hover:text-brand-bright",
        className
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      <span className="max-w-full text-sm leading-none sm:hidden">{label}</span>
      <span className="hidden whitespace-nowrap text-sm sm:inline">{label}</span>
    </Link>
  );
}
