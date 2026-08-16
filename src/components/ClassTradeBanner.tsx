"use client";

import type { ClassroomTrade } from "@/lib/classroom";

function untilLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <p className="text-sm font-semibold text-foreground">{trade.label}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-muted">
        {trade.message}
        {until ? ` Until ${until}.` : ""}
      </p>
      {teacherNote ? (
        <p className="mt-1 text-sm text-muted">{teacherNote}</p>
      ) : null}
      {!compact && trade.purpose ? (
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          {trade.purpose}
        </p>
      ) : null}
    </div>
  );
}
