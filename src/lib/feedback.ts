/** In-app feedback. Weekly prompt is directed chips. Manual is a topic plus a rant. */

export const FEEDBACK_TO = "martin.aasa@upthink.ee";
export const FEEDBACK_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const FEEDBACK_STORAGE_KEY = "upside-feedback-v1";

export const WEEKLY_FEEL = [
  { id: "easy", label: "Easy to follow" },
  { id: "mixed", label: "Mixed" },
  { id: "stuck", label: "Confusing or in the way" },
] as const;

export const WEEKLY_HELPED = [
  { id: "prices", label: "Seeing what I own and today's prices" },
  { id: "pulse", label: "Pulse" },
  { id: "forecast", label: "Forecast" },
  { id: "circle", label: "Circle or a class" },
  { id: "emails", label: "The emails" },
  { id: "editing", label: "Adding or changing names" },
  { id: "nothing", label: "Nothing yet" },
] as const;

export const WEEKLY_BLOCKED = [
  { id: "crowded", label: "Too much on screen" },
  { id: "lost", label: "Couldn't find a thing" },
  { id: "next", label: "Didn't know what to do next" },
  { id: "trust", label: "Didn't trust a number" },
  { id: "none", label: "Nothing got in the way" },
] as const;

export const WEEKLY_CHANGE = [
  { id: "home", label: "Home and the briefing" },
  { id: "adding", label: "Adding names" },
  { id: "pulse", label: "Pulse" },
  { id: "forecast", label: "Forecast" },
  { id: "circle", label: "Circle or a class" },
  { id: "emails", label: "The emails" },
  { id: "other", label: "Something I haven't named" },
] as const;

export type WeeklyFeelId = (typeof WEEKLY_FEEL)[number]["id"];
export type WeeklyHelpedId = (typeof WEEKLY_HELPED)[number]["id"];
export type WeeklyBlockedId = (typeof WEEKLY_BLOCKED)[number]["id"];
export type WeeklyChangeId = (typeof WEEKLY_CHANGE)[number]["id"];

export type FeedbackSchedule = {
  firstSeenAt: string;
  lastPromptAt: string | null;
  lastSubmittedAt: string | null;
  snoozeUntil: string | null;
};

export type WeeklyFeedbackAnswers = {
  feel: WeeklyFeelId | null;
  helped: WeeklyHelpedId[];
  blocked: WeeklyBlockedId[];
  change: WeeklyChangeId | null;
  changeNote: string;
};

export type ManualFeedbackDraft = {
  topic: string;
  body: string;
};

const FEEL_IDS = new Set(WEEKLY_FEEL.map((o) => o.id));
const HELPED_IDS = new Set(WEEKLY_HELPED.map((o) => o.id));
const BLOCKED_IDS = new Set(WEEKLY_BLOCKED.map((o) => o.id));
const CHANGE_IDS = new Set(WEEKLY_CHANGE.map((o) => o.id));

function defaultSchedule(nowIso: string): FeedbackSchedule {
  return {
    firstSeenAt: nowIso,
    lastPromptAt: null,
    lastSubmittedAt: null,
    snoozeUntil: null,
  };
}

export function emptyWeeklyAnswers(): WeeklyFeedbackAnswers {
  return {
    feel: null,
    helped: [],
    blocked: [],
    change: null,
    changeNote: "",
  };
}

export function loadFeedbackSchedule(): FeedbackSchedule | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FeedbackSchedule>;
    if (typeof parsed.firstSeenAt !== "string") return null;
    return {
      firstSeenAt: parsed.firstSeenAt,
      lastPromptAt:
        typeof parsed.lastPromptAt === "string" ? parsed.lastPromptAt : null,
      lastSubmittedAt:
        typeof parsed.lastSubmittedAt === "string"
          ? parsed.lastSubmittedAt
          : null,
      snoozeUntil:
        typeof parsed.snoozeUntil === "string" ? parsed.snoozeUntil : null,
    };
  } catch {
    return null;
  }
}

export function saveFeedbackSchedule(state: FeedbackSchedule) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Stamp first seen. Older accounts keep their created date so a week is already due. */
export function touchFeedbackSchedule(
  accountCreatedAt?: string | null,
  now = Date.now()
): FeedbackSchedule {
  const stored = loadFeedbackSchedule();
  const created = accountCreatedAt ? Date.parse(accountCreatedAt) : NaN;
  const first = stored?.firstSeenAt
    ? stored.firstSeenAt
    : Number.isFinite(created)
      ? new Date(created).toISOString()
      : new Date(now).toISOString();
  const next: FeedbackSchedule = {
    ...(stored ?? defaultSchedule(first)),
    firstSeenAt: first,
  };
  saveFeedbackSchedule(next);
  return next;
}

export function isWeeklyFeedbackDue(
  schedule: FeedbackSchedule,
  now = Date.now()
): boolean {
  const start = Date.parse(schedule.firstSeenAt);
  if (!Number.isFinite(start) || now < start + FEEDBACK_WEEK_MS) return false;
  const snooze = schedule.snoozeUntil ? Date.parse(schedule.snoozeUntil) : NaN;
  if (Number.isFinite(snooze) && now < snooze) return false;
  return true;
}

export function snoozeFeedbackSchedule(
  schedule: FeedbackSchedule,
  now = Date.now()
): FeedbackSchedule {
  const next: FeedbackSchedule = {
    ...schedule,
    lastPromptAt: new Date(now).toISOString(),
    snoozeUntil: new Date(now + FEEDBACK_WEEK_MS).toISOString(),
  };
  saveFeedbackSchedule(next);
  return next;
}

export function markFeedbackSubmitted(
  schedule: FeedbackSchedule,
  now = Date.now()
): FeedbackSchedule {
  const next: FeedbackSchedule = {
    ...schedule,
    lastPromptAt: new Date(now).toISOString(),
    lastSubmittedAt: new Date(now).toISOString(),
    snoozeUntil: new Date(now + FEEDBACK_WEEK_MS).toISOString(),
  };
  saveFeedbackSchedule(next);
  return next;
}

function clip(s: string, max: number): string {
  return s.trim().slice(0, max);
}

function uniqueIds<T extends string>(raw: unknown, allowed: Set<T>): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string" || !allowed.has(item as T) || seen.has(item)) {
      continue;
    }
    seen.add(item);
    out.push(item as T);
  }
  return out;
}

export function weeklyHasAnswer(answers: WeeklyFeedbackAnswers): boolean {
  return Boolean(
    answers.feel ||
      answers.helped.length ||
      answers.blocked.length ||
      answers.change
  );
}

export function parseWeeklyFeedback(body: unknown):
  | { ok: true; answers: WeeklyFeedbackAnswers }
  | { ok: false; error: string } {
  const raw = (body ?? {}) as Record<string, unknown>;
  const feel =
    typeof raw.feel === "string" && FEEL_IDS.has(raw.feel as WeeklyFeelId)
      ? (raw.feel as WeeklyFeelId)
      : null;
  const helped = uniqueIds(raw.helped, HELPED_IDS);
  const blocked = uniqueIds(raw.blocked, BLOCKED_IDS);
  const change =
    typeof raw.change === "string" && CHANGE_IDS.has(raw.change as WeeklyChangeId)
      ? (raw.change as WeeklyChangeId)
      : null;
  const changeNote = clip(String(raw.changeNote ?? ""), 400);
  const answers: WeeklyFeedbackAnswers = {
    feel,
    helped,
    blocked,
    change,
    changeNote,
  };
  if (!weeklyHasAnswer(answers)) {
    return { ok: false, error: "Pick at least one answer." };
  }
  return { ok: true, answers };
}

export function parseManualFeedback(body: unknown):
  | { ok: true; draft: ManualFeedbackDraft }
  | { ok: false; error: string } {
  const raw = (body ?? {}) as Record<string, unknown>;
  const topic = clip(String(raw.topic ?? ""), 120);
  const text = clip(String(raw.body ?? ""), 8000);
  if (!topic) return { ok: false, error: "Say what this is about." };
  if (text.length < 8) {
    return { ok: false, error: "Give it a bit more than a line." };
  }
  return { ok: true, draft: { topic, body: text } };
}

function labelOf<T extends { id: string; label: string }>(
  list: readonly T[],
  id: string | null
): string {
  if (!id) return "—";
  return list.find((o) => o.id === id)?.label ?? id;
}

export function formatWeeklyFeedbackText(answers: WeeklyFeedbackAnswers): string {
  const helped =
    answers.helped.length === 0
      ? "—"
      : answers.helped.map((id) => labelOf(WEEKLY_HELPED, id)).join(", ");
  const blocked =
    answers.blocked.length === 0
      ? "—"
      : answers.blocked.map((id) => labelOf(WEEKLY_BLOCKED, id)).join(", ");
  const lines = [
    "How the week felt: " + labelOf(WEEKLY_FEEL, answers.feel),
    "What helped: " + helped,
    "What got in the way: " + blocked,
    "One thing to change: " + labelOf(WEEKLY_CHANGE, answers.change),
  ];
  if (answers.changeNote) lines.push("In their words: " + answers.changeNote);
  return lines.join("\n");
}
