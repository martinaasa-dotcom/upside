"use client";

import { useAuth } from "@/components/AuthProvider";
import { MobileTabBar, type MobileTabId } from "@/components/mobile/MobileTabBar";
import { MobileTopBar } from "@/components/mobile/MobileTopBar";
import type { ReactNode } from "react";

/** Sticky top bar + bottom tabs. Desktop headers stay on the page. */
export function MobileChrome({
  title,
  active,
  alertCount,
  end,
}: {
  title: string;
  active: MobileTabId;
  alertCount?: number;
  end?: ReactNode;
}) {
  const { profile, user } = useAuth();
  const initial = (profile?.display_name || user?.email || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <>
      <MobileTopBar
        title={title}
        avatar={{ url: profile?.avatar_url, initial }}
        alertCount={alertCount}
        end={end}
      />
      <MobileTabBar active={active} alertCount={alertCount} />
    </>
  );
}
