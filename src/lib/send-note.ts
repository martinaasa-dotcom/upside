/** Shared Resend send. Key stays in env. Never hardcode it. */

import { Resend } from "resend";

const DEFAULT_FROM = "Upside Lab <notes@upsidelab.app>";
const MARK_URL = "https://upsidelab.app/upside-icon.svg";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function noteHtml(text: string): string {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const last = blocks[blocks.length - 1];
  const body = blocks
    .map((block, i) => {
      const muted = block === last && /Account turns this off/i.test(block);
      const style = muted
        ? "margin:28px 0 0 0;font-size:13px;line-height:1.4;color:#6b6b6b"
        : i === 0
          ? "margin:0 0 18px 0;font-size:18px;line-height:1.4;color:#111"
          : "margin:0 0 14px 0;font-size:16px;line-height:1.5;color:#1a1a1a";
      return `<p style="${style}">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
  return `<div style="max-width:420px;padding:8px 0;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a">
<img src="${MARK_URL}" width="28" height="28" alt="" style="display:block;margin:0 0 20px 0;border:0" />
${body}
</div>`;
}

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
    html: input.html ?? noteHtml(input.text),
    headers: {
      "List-Unsubscribe": "<https://upsidelab.app/account>",
    },
  });
  return !error;
}
