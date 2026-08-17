"use client";

import { CircleDockLink } from "@/components/CircleDockLink";
import { cn } from "@/lib/format";
import { stashOpenTab } from "@/lib/active-sheet";
import {
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
} from "@/lib/overview";
import { Activity, Calculator, FlaskConical, LayoutDashboard } from "lucide-react";
import Link from "next/link";

const MODES = [
  {
    id: OVERVIEW_TAB_ID,
    href: "/?tab=overview",
    tab: "overview",
    label: "Overview",
    shortLabel: "Home",
    title: "Today's briefing and your portfolios",
    Icon: LayoutDashboard,
  },
  {
    id: PULSE_TAB_ID,
    href: "/?tab=pulse",
    tab: "pulse",
    label: "Pulse",
    shortLabel: "Pulse",
    title: "Pulse for names you hold",
    Icon: Activity,
  },
  {
    id: LAB_TAB_ID,
    href: "/?tab=lab",
    tab: "lab",
    label: "Lab",
    shortLabel: "Lab",
    title: "Allocation, risk, trends, seasonality",
    Icon: FlaskConical,
  },
  {
    id: COMPOUND_TAB_ID,
    href: "/?tab=compound",
    tab: "compound",
    label: "Compound",
    shortLabel: "Growth",
    title: "What your portfolio could become if you keep going",
    Icon: Calculator,
  },
] as const;

const ITEM =
  "flex h-full w-full min-h-0 min-w-0 flex-col items-center justify-center gap-0.5 px-1.5 text-sm font-medium transition sm:flex-row sm:gap-1.5 sm:px-2";

type Props = {
  /** Book tab that is on. Empty on Circle pages so only Circle lights up. */
  activeId?: string | null;
  /** Book dock: switch tabs in place. Off-book pages use links. */
  onSelectMode?: (id: string) => void;
  hiddenModeIds?: string[];
  guest?: boolean;
  /** Hide Circle on the phone book dock. MobileTabBar already has it. */
  hideCircleOnPhone?: boolean;
  className?: string;
};

export function BookModeDock({
  activeId,
  onSelectMode,
  hiddenModeIds = [],
  guest = false,
  hideCircleOnPhone = false,
  className,
}: Props) {
  const modes = MODES.filter((m) => {
    if (guest && m.id === LAB_TAB_ID) return false;
    if (hiddenModeIds.includes(m.id)) return false;
    return true;
  });
  const deskCols = modes.length + 1;
  const phoneCols = hideCircleOnPhone ? modes.length : deskCols;

  return (
    <div
      role="tablist"
      aria-label="App"
      className={cn(
        "grid h-12 w-full overflow-hidden rounded-lg bg-muted ring-1 ring-inset ring-border",
        phoneCols === 3 && deskCols === 3 && "grid-cols-3 sm:w-[26rem]",
        phoneCols === 3 && deskCols === 4 && "grid-cols-3 sm:grid-cols-4 sm:w-[34rem]",
        phoneCols === 4 && deskCols === 4 && "grid-cols-4 sm:w-[34rem]",
        phoneCols === 4 && deskCols === 5 && "grid-cols-4 sm:grid-cols-5 sm:w-[42rem]",
        phoneCols === 5 && deskCols === 5 && "grid-cols-5 sm:w-[42rem]",
        className
      )}
    >
      {modes.map(({ id, href, tab, label, shortLabel, title, Icon }) => {
        const active = activeId === id;
        const inner = (
          <>
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                id === COMPOUND_TAB_ID && "scale-125"
              )}
              strokeWidth={2}
              aria-hidden
            />
            <span className="max-w-full text-sm leading-none sm:hidden">
              {shortLabel}
            </span>
            <span className="hidden whitespace-nowrap text-sm sm:inline">
              {label}
            </span>
          </>
        );
        const look = cn(
          ITEM,
          active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        );
        if (onSelectMode) {
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              title={title}
              onClick={() => onSelectMode(id)}
              className={look}
            >
              {inner}
            </button>
          );
        }
        return (
          <Link
            key={id}
            href={href}
            prefetch
            title={title}
            onClick={() => stashOpenTab(tab)}
            className={look}
          >
            {inner}
          </Link>
        );
      })}
      <CircleDockLink hideOnPhone={hideCircleOnPhone} />
    </div>
  );
}
