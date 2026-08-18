"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
          ? "border-border bg-accent text-foreground"
          : "border-border bg-muted/60 text-foreground hover:border-border"
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
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
        disabled={busy}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="relative max-h-full w-full overflow-y-auto rounded-t-xl bg-popover ring-1 ring-foreground/18 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-xl sm:pb-6"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3
            id="feedback-title"
            className="text-base font-semibold text-foreground"
          >
            {mode === "weekly" ? "How was this week?" : "Tell Upside"}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            title="Close"
            className="touch-target sm:size-7"
          >
            <X />
          </Button>
        </div>

        {sent ? (
          <p className="text-sm leading-relaxed text-foreground">
            Got it. Upside reads these.
          </p>
        ) : mode === "weekly" ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              A few pointed questions about this week in Upside Lab. Skip any
              that don&apos;t fit.
            </p>

            <fieldset className="flex flex-col gap-2">
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

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-foreground">
                What actually helped?
              </legend>
              <p className="text-sm text-muted-foreground">Pick every one that did.</p>
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

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-foreground">
                What got in the way?
              </legend>
              <p className="text-sm text-muted-foreground">Pick every one that did.</p>
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

            <fieldset className="flex flex-col gap-2">
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
                <label className="flex flex-col gap-1 pt-1">
                  <span className="text-sm text-muted-foreground">
                    In one sentence, what should be different?
                  </span>
                  <Input
                    value={weekly.changeNote}
                    onChange={(e) =>
                      setWeekly((w) => ({ ...w, changeNote: e.target.value }))
                    }
                    maxLength={400}
                    placeholder="Name the screen or the moment."
                  />
                </label>
              )}
            </fieldset>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              What is this about, then dump the rest. A bug, a missing thing, or
              a rant. Upside reads these.
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">What is this about?</span>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={120}
                placeholder="A bug, a missing thing, a rant"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Say it</span>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={8000}
                rows={8}
                placeholder="Word vomit is fine. What happened, what you wanted, what would be better."
                className="min-h-40 resize-y"
              />
            </label>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-loss">{error}</p>}

        {!sent && (
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={busy}
            >
              {mode === "weekly" ? "Not this week" : "Cancel"}
            </Button>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !canSend}
            >
              {busy ? "Sending…" : mode === "weekly" ? "Send this week" : "Send it"}
            </Button>
          </div>
        )}
      </div>
    </ViewportOverlay>
  );
}
