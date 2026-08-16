"use client";

import { useAuth } from "@/components/AuthProvider";
import { MobileTabBar, type MobileTabId } from "@/components/mobile/MobileTabBar";
import { MobileTopBar } from "@/components/mobile/MobileTopBar";
import type { ReactNode } from "react";

/** Sticky top bar and the same gold-well dock as desktop. */
export function MobileChrome({
  title,
  active,
  alertCount,
  end,
  hiddenModeIds,
}: {
  title: string;
  active: MobileTabId | null;
  alertCount?: number;
  end?: ReactNode;
  hiddenModeIds?: string[];
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
      <MobileTabBar
        active={active}
        alertCount={alertCount}
        hiddenModeIds={hiddenModeIds}
      />
    </>
  );
}
