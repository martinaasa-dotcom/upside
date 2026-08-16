/** Shared Resend send. Key stays in env. Never hardcode it. */

import { fallbackNoteHtml } from "@/lib/email-letter";
import { Resend } from "resend";

const DEFAULT_FROM = "Upside Lab <notes@upsidelab.app>";

export function noteEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendNoteEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim() || DEFAULT_FROM;
  if (!key) return false;
  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html ?? fallbackNoteHtml(input.text),
    headers: {
      "List-Unsubscribe": "<https://upsidelab.app/account>",
      "X-Entity-Ref-ID": crypto.randomUUID(),
    },
  });
  return !error;
}
