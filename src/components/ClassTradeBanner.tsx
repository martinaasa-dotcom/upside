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
    <div className="rounded-2xl border border-white/10 bg-card/80 px-4 py-3">
      <p className="text-sm font-semibold text-white">{trade.label}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
        {trade.message}
        {until ? ` Until ${until}.` : ""}
      </p>
      {teacherNote ? (
        <p className="mt-1 text-xs text-zinc-500">{teacherNote}</p>
      ) : null}
      {!compact && trade.purpose ? (
        <p className="mt-2 text-sm leading-relaxed text-zinc-200">
          {trade.purpose}
        </p>
      ) : null}
    </div>
  );
}
