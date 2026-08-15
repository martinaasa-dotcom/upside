/** Shared Resend send. Key stays in env. Never hardcode it. */

import { Resend } from "resend";

const DEFAULT_FROM = "Upside Lab <notes@upsidelab.app>";
const MARK_URL = "https://upsidelab.app/icons/email-lockup.png?v=1";

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
      const muted =
        block === last &&
        (/Turn these notes off/i.test(block) || /one-time note/i.test(block));
      const style = muted
        ? "margin:20px 0 0 0;font-size:12px;line-height:1.4;color:#a89878"
        : i === 0
          ? "margin:0 0 16px 0;font-size:18px;line-height:1.4;font-weight:700;color:#ede8dc"
          : "margin:0 0 14px 0;font-size:15px;line-height:1.5;color:#a89878";
      return `<p style="${style}">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
  return `<div style="width:100%;padding:22px 16px;background:#1a2820;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#ede8dc">
<img src="${MARK_URL}" width="180" height="33" alt="Upside Lab" style="display:block;margin:0 0 16px 0;border:0" />
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
      "X-Entity-Ref-ID": crypto.randomUUID(),
    },
  });
  return !error;
}
