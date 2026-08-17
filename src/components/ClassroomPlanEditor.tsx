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
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
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
  const [draftError, setDraftError] = useState<string | null>(null);

  function addStretch() {
    const startsAt = fromLocalInput(draftStart);
    if (!startsAt) return;
    const endsAt = fromLocalInput(draftEnd);
    if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      setDraftError("The end has to be after the start.");
      return;
    }
    setDraftError(null);
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
    <div className="mt-8 border-t border-border pt-6">
      <p className="text-sm font-medium text-muted-foreground">What students can do</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Change this whenever the lesson changes. Buy week, closed, sell
        and move money, or leave it open.
      </p>
      {trade ? (
        <p className="mt-2 text-sm text-foreground">
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
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            disabled={busy || trade?.kind === k.id}
            onClick={() => onStart(k.id)}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-sm font-medium transition disabled:opacity-50",
              trade?.kind === k.id
                ? "border-border bg-muted text-primary"
                : "border-border text-foreground/80 hover:border-foreground/20-mid hover:text-foreground"
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      <p className="mt-8 text-sm font-medium text-muted-foreground">Schedule</p>
      {scheduled.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing dated. Use the buttons above, or add a stretch with dates.
        </p>
      ) : (
        <ul className="flex flex-col mt-3 gap-2.5">
          {scheduled.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2.5"
            >
              <span className="min-w-0 text-sm text-foreground/80">
                {classPeriodLabel(p.kind)}
                <span className="block text-muted-foreground">
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
                className="rounded-md p-1 text-muted-foreground hover:text-loss disabled:opacity-50"
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col mt-6 gap-3 rounded-lg border border-border bg-muted p-4">
        <p className="text-sm font-medium text-muted-foreground">Add a stretch</p>
        <NativeSelect
          value={draftKind}
          onChange={(e) => setDraftKind(e.target.value as ClassPeriodKind)}
          className="w-full"
        >
          {KINDS.map((k) => (
            <NativeSelectOption key={k.id} value={k.id}>
              {k.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <label className="block text-sm text-muted-foreground">
          Starts
          <Input
            type="datetime-local"
            value={draftStart}
            onChange={(e) => setDraftStart(e.target.value)}
            className="mt-1"
          />
        </label>
        <label className="block text-sm text-muted-foreground">
          Ends (optional)
          <Input
            type="datetime-local"
            value={draftEnd}
            onChange={(e) => setDraftEnd(e.target.value)}
            className="mt-1"
          />
        </label>
        {draftError ? (
          <p className="text-sm text-loss">{draftError}</p>
        ) : null}
        <button
          type="button"
          disabled={busy || !draftStart}
          onClick={addStretch}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium text-foreground hover:text-foreground disabled:opacity-40"
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
