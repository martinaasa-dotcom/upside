"use client";

import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { cn } from "@/lib/format";
import {
  WEEKLY_BLOCKED,
  WEEKLY_CHANGE,
  WEEKLY_FEEL,
  WEEKLY_HELPED,
  emptyWeeklyAnswers,
  weeklyHasAnswer,
  type WeeklyBlockedId,
  type WeeklyFeedbackAnswers,
  type WeeklyHelpedId,
} from "@/lib/feedback";
import { plainError } from "@/lib/plain-error";
import { postJsonOrQueue } from "@/lib/offline/queued-fetch";
import { useTimeout } from "@/lib/use-timeout";
import { X } from "lucide-react";
import { useState } from "react";

export type FeedbackMode = "weekly" | "manual";

type Props = {
  mode: FeedbackMode;
  onClose: () => void;
  onSent: () => void;
};

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2 text-left text-sm transition",
        selected
          ? "border-white/25 bg-hover text-foreground"
          : "border-border bg-well/60 text-foreground/80 hover:border-brand-mid"
      )}
    >
      {children}
    </button>
  );
}

function toggleId<T extends string>(list: T[], id: T): T[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function FeedbackModal({ mode, onClose, onSent }: Props) {
  const later = useTimeout();
  const [weekly, setWeekly] = useState<WeeklyFeedbackAnswers>(emptyWeeklyAnswers);
  const [topic, setTopic] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload =
        mode === "weekly"
          ? { kind: "weekly" as const, ...weekly }
          : { kind: "manual" as const, topic, body };
      const res = await postJsonOrQueue("/api/feedback", payload, "draft");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(plainError(data.error, "Couldn't send that."));
      }
      setSent(true);
      onSent();
      later(onClose, 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that.");
    } finally {
      setBusy(false);
    }
  }

  const canSend =
    mode === "weekly" ? weeklyHasAnswer(weekly) : topic.trim() && body.trim().length >= 8;

  return (
    <ViewportOverlay className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
        disabled={busy}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="relative max-h-full w-full overflow-y-auto rounded-t-2xl border border-border bg-well p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-2xl sm:pb-5"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3
            id="feedback-title"
            className="text-base font-semibold text-foreground"
          >
            {mode === "weekly" ? "How was this week?" : "Tell Upside"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            title="Close"
            className="rounded-lg p-3.5 text-muted hover:bg-hover hover:text-foreground disabled:opacity-40 sm:p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {sent ? (
          <p className="text-sm leading-relaxed text-foreground">
            Got it. Upside reads these.
          </p>
        ) : mode === "weekly" ? (
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-muted">
              A few pointed questions about this week in Upside Lab. Skip any
              that don&apos;t fit.
            </p>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">
                How did this week feel?
              </legend>
              <div className="grid gap-2">
                {WEEKLY_FEEL.map((opt) => (
                  <Chip
                    key={opt.id}
                    selected={weekly.feel === opt.id}
                    onClick={() =>
                      setWeekly((w) => ({
                        ...w,
                        feel: w.feel === opt.id ? null : opt.id,
                      }))
                    }
                  >
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">
                What actually helped?
              </legend>
              <p className="text-xs text-muted">Pick every one that did.</p>
              <div className="grid gap-2">
                {WEEKLY_HELPED.map((opt) => (
                  <Chip
                    key={opt.id}
                    selected={weekly.helped.includes(opt.id)}
                    onClick={() =>
                      setWeekly((w) => ({
                        ...w,
                        helped: toggleId(w.helped, opt.id as WeeklyHelpedId),
                      }))
                    }
                  >
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">
                What got in the way?
              </legend>
              <p className="text-xs text-muted">Pick every one that did.</p>
              <div className="grid gap-2">
                {WEEKLY_BLOCKED.map((opt) => (
                  <Chip
                    key={opt.id}
                    selected={weekly.blocked.includes(opt.id)}
                    onClick={() =>
                      setWeekly((w) => ({
                        ...w,
                        blocked: toggleId(w.blocked, opt.id as WeeklyBlockedId),
                      }))
                    }
                  >
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">
                If you could change one thing for next week, what is it?
              </legend>
              <div className="grid gap-2">
                {WEEKLY_CHANGE.map((opt) => (
                  <Chip
                    key={opt.id}
                    selected={weekly.change === opt.id}
                    onClick={() =>
                      setWeekly((w) => ({
                        ...w,
                        change: w.change === opt.id ? null : opt.id,
                        changeNote: w.change === opt.id ? "" : w.changeNote,
                      }))
                    }
                  >
                    {opt.label}
                  </Chip>
                ))}
              </div>
              {weekly.change && (
                <label className="block space-y-1 pt-1">
                  <span className="text-sm text-muted">
                    In one sentence, what should be different?
                  </span>
                  <input
                    value={weekly.changeNote}
                    onChange={(e) =>
                      setWeekly((w) => ({ ...w, changeNote: e.target.value }))
                    }
                    maxLength={400}
                    placeholder="Name the screen or the moment."
                    className="w-full rounded-lg border border-border bg-well px-3 py-2.5 text-sm"
                  />
                </label>
              )}
            </fieldset>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted">
              What is this about, then dump the rest. A bug, a missing thing, or
              a rant. Upside reads these.
            </p>
            <label className="block space-y-1">
              <span className="text-sm text-muted">What is this about?</span>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={120}
                placeholder="A bug, a missing thing, a rant"
                className="w-full rounded-lg border border-border bg-well px-3 py-2.5 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-muted">Say it</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={8000}
                rows={8}
                placeholder="Word vomit is fine. What happened, what you wanted, what would be better."
                className="w-full resize-y rounded-lg border border-border bg-well px-3 py-2.5 text-sm"
              />
            </label>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-loss">{error}</p>}

        {!sent && (
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="touch-target rounded-lg px-3 py-2 text-sm text-muted hover:bg-hover hover:text-foreground disabled:opacity-40"
            >
              {mode === "weekly" ? "Not this week" : "Cancel"}
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !canSend}
              className="btn-primary disabled:opacity-40"
            >
              {busy ? "Sending…" : mode === "weekly" ? "Send this week" : "Send it"}
            </button>
          </div>
        )}
      </div>
    </ViewportOverlay>
  );
}
