import {
  FEEDBACK_TO,
  formatWeeklyFeedbackText,
  parseManualFeedback,
  parseWeeklyFeedback,
} from "@/lib/feedback";
import { checkRateLimit } from "@/lib/rate-limit";
import { noteEmailConfigured, sendNoteEmail } from "@/lib/send-note";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const limit = checkRateLimit(`feedback:${auth.user.id}`, 6, 60 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Give it a minute. You already sent a few." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec ?? 60) } }
    );
  }

  if (!noteEmailConfigured()) {
    return NextResponse.json(
      { error: "Couldn't send that just now." },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    kind?: string;
    feel?: unknown;
    helped?: unknown;
    blocked?: unknown;
    change?: unknown;
    changeNote?: unknown;
    topic?: unknown;
    body?: unknown;
  };

  const who = auth.user.email?.trim() || auth.user.id;
  const name =
    (typeof auth.user.user_metadata?.full_name === "string" &&
      auth.user.user_metadata.full_name.trim()) ||
    who;

  if (body.kind === "weekly") {
    const parsed = parseWeeklyFeedback(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const text = [
      `${name} sent the weekly prompt.`,
      `Email: ${who}`,
      "",
      formatWeeklyFeedbackText(parsed.answers),
    ].join("\n");
    const ok = await sendNoteEmail({
      to: FEEDBACK_TO,
      subject: `Week in Upside Lab: ${name}`,
      text,
      replyTo: auth.user.email ?? undefined,
    });
    if (!ok) {
      return NextResponse.json(
        { error: "Couldn't send that just now." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (body.kind === "manual") {
    const parsed = parseManualFeedback(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const text = [
      `${name} wrote in.`,
      `Email: ${who}`,
      `About: ${parsed.draft.topic}`,
      "",
      parsed.draft.body,
    ].join("\n");
    const ok = await sendNoteEmail({
      to: FEEDBACK_TO,
      subject: `Feedback: ${parsed.draft.topic}`,
      text,
      replyTo: auth.user.email ?? undefined,
    });
    if (!ok) {
      return NextResponse.json(
        { error: "Couldn't send that just now." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "kind required" }, { status: 400 });
}
