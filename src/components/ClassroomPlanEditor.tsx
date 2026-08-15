"use client";

import {
  CLASS_PERIOD_KINDS,
  classPeriodLabel,
  parseClassPlan,
  type ClassPeriod,
  type ClassPeriodKind,
  type ClassPlan,
  type ClassroomTrade,
} from "@/lib/classroom";
import { cn } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

function fromLocalInput(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

const KINDS = CLASS_PERIOD_KINDS.map((id) => ({
  id,
  label: classPeriodLabel(id),
}));

export function ClassroomPlanEditor({
  plan,
  trade,
  busy,
  onStart,
  onSavePlan,
}: {
  plan: ClassPlan;
  trade: ClassroomTrade | null;
  busy: boolean;
  onStart: (kind: ClassPeriodKind) => void;
  onSavePlan: (plan: ClassPlan) => void;
}) {
  const scheduled = plan.periods.filter(
    (p) => !p.endsAt || Date.parse(p.endsAt) > Date.now()
  );
  const [draftKind, setDraftKind] = useState<ClassPeriodKind>("buy");
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");

  function addStretch() {
    const startsAt = fromLocalInput(draftStart);
    if (!startsAt) return;
    const endsAt = fromLocalInput(draftEnd);
    const next: ClassPeriod = {
      id: crypto.randomUUID(),
      kind: draftKind,
      startsAt,
      endsAt,
    };
    onSavePlan(parseClassPlan({ ...plan, periods: [...plan.periods, next] }));
    setDraftStart("");
    setDraftEnd("");
  }

  function remove(id: string) {
    onSavePlan(
      parseClassPlan({
        ...plan,
        periods: plan.periods.filter((p) => p.id !== id),
      })
    );
  }

  return (
    <div className="mt-5 border-t border-zinc-800 pt-4">
      <p className="text-xs font-medium text-zinc-400">What students can do</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
        Change this whenever the lesson changes. Buy week, sit still, sell
        and move money, or leave it open.
      </p>
      {trade ? (
        <p className="mt-2 text-sm text-zinc-200">
          Now: {trade.label}
          {trade.until
            ? ` until ${new Date(trade.until).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}`
            : ""}
        </p>
      ) : null}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            disabled={busy}
            onClick={() => onStart(k.id)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50",
              trade?.kind === k.id
                ? "border-brand/50 bg-brand/20 text-brand-bright"
                : "border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-white"
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      <p className="mt-4 text-xs font-medium text-zinc-400">Schedule</p>
      {scheduled.length === 0 ? (
        <p className="mt-1 text-xs text-zinc-500">
          Nothing dated. Use the buttons above, or add a stretch with dates.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {scheduled.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 px-2.5 py-1.5"
            >
              <span className="min-w-0 text-xs text-zinc-300">
                {classPeriodLabel(p.kind)}
                <span className="block text-zinc-500">
                  {new Date(p.startsAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {p.endsAt
                    ? ` → ${new Date(p.endsAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}`
                    : ""}
                </span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(p.id)}
                className="rounded-md p-1 text-zinc-500 hover:text-rose-300 disabled:opacity-50"
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 space-y-2 rounded-lg border border-zinc-800 p-2.5">
        <p className="text-xs font-medium text-zinc-400">Add a stretch</p>
        <select
          value={draftKind}
          onChange={(e) => setDraftKind(e.target.value as ClassPeriodKind)}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100"
        >
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <label className="block text-xs text-zinc-500">
          Starts
          <input
            type="datetime-local"
            value={draftStart}
            onChange={(e) => setDraftStart(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100"
          />
        </label>
        <label className="block text-xs text-zinc-500">
          Ends (optional)
          <input
            type="datetime-local"
            value={draftEnd}
            onChange={(e) => setDraftEnd(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100"
          />
        </label>
        <button
          type="button"
          disabled={busy || !draftStart}
          onClick={addStretch}
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:text-white disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Add stretch
        </button>
      </div>
    </div>
  );
}

export function planFromCommunity(raw: unknown): ClassPlan {
  return parseClassPlan(raw);
}
