"use client";

import type { ClassroomTrade } from "@/lib/classroom";
import { formatDateTime } from "@/lib/timezone";

function untilLabel(iso: string | null): string | null {
  if (!iso) return null;
  return (
    formatDateTime(iso, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) || null
  );
}

export function ClassTradeBanner({
  trade,
  compact,
  teacherNote,
}: {
  trade: ClassroomTrade;
  compact?: boolean;
  teacherNote?: string;
}) {
  const until = untilLabel(trade.until);
  return (
    <div className="rounded-xl glass ring-1 ring-foreground/20 px-6 py-6">
      <p className="text-sm font-semibold text-foreground">{trade.label}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
        {trade.message}
        {until ? ` Until ${until}.` : ""}
      </p>
      {teacherNote ? (
        <p className="mt-1 text-sm text-muted-foreground">{teacherNote}</p>
      ) : null}
      {!compact && trade.purpose ? (
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          {trade.purpose}
        </p>
      ) : null}
    </div>
  );
}
