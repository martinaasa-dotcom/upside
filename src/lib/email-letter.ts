/**
 * One letterhead for every Upside Lab inbox note.
 * Dark field, brass rule, serif for the take, sans for the figures.
 */

export const EMAIL = {
  app: "#08090c",
  cream: "#f4f1ea",
  muted: "#9aa3ad",
  gold: "#d6ad69",
  gain: "#10b981",
  loss: "#f43f5e",
  line: "#181b22",
  sans: "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
  serif: "Georgia,'Times New Roman',Times,serif",
  lockup: "https://upsidelab.app/icons/email-lockup.png?v=2",
  origin: "https://upsidelab.app",
} as const;

export function escapeEmail(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function emailKicker(text: string): string {
  return `<p style="margin:0;font-family:${EMAIL.sans};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${EMAIL.gold}">${escapeEmail(text)}</p>`;
}

export function emailHairline(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:32px 0 0 0">
  <tr><td style="height:1px;background:${EMAIL.line};font-size:0;line-height:0">&nbsp;</td></tr>
</table>`;
}

export function emailSection(title: string, inner: string): string {
  return `${emailHairline()}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0 0 0">
  <tr><td>${emailKicker(title)}</td></tr>
  <tr><td style="padding:14px 0 0 0">${inner}</td></tr>
</table>`;
}

export function emailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:36px 0 0 0">
  <tr>
    <td bgcolor="${EMAIL.cream}" style="border-radius:2px">
      <a href="${escapeEmail(href)}" style="display:inline-block;padding:11px 18px;font-family:${EMAIL.sans};font-size:13px;letter-spacing:0.04em;font-weight:600;color:${EMAIL.app};text-decoration:none">${escapeEmail(label)}</a>
    </td>
  </tr>
</table>`;
}

export function emailAccountFooter(): string {
  return `<p style="margin:36px 0 0 0;font-family:${EMAIL.sans};font-size:12px;line-height:1.5;color:${EMAIL.muted}">Turn these notes off in <a href="${EMAIL.origin}/account" style="color:${EMAIL.gold};text-decoration:underline">Account</a>.</p>`;
}

export function emailPreheader(preview: string): string {
  const pad = "&#847;&zwnj;&nbsp;".repeat(80);
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeEmail(preview)}${pad}</div>`;
}

export function wrapEmailLetter(input: {
  title: string;
  preview: string;
  dateLine?: string;
  body: string;
  footer?: string;
  hideOpener?: boolean;
}): string {
  const opener =
    input.hideOpener || !input.preview
      ? ""
      : `<p style="margin:20px 0 0 0;font-family:${EMAIL.serif};font-size:17px;line-height:1.45;color:${EMAIL.cream}">${escapeEmail(input.preview)}</p>`;
  const date = input.dateLine
    ? `<p style="margin:${opener ? "10px" : "14px"} 0 0 0;font-family:${EMAIL.sans};font-size:13px;line-height:1.4;letter-spacing:0.02em;color:${EMAIL.muted}">${escapeEmail(input.dateLine)}</p>`
    : "";
  const footer = input.footer ?? "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>${escapeEmail(input.title)}</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin:0 !important; padding:0 !important; background:${EMAIL.app} !important; width:100% !important; }
</style>
</head>
<body style="margin:0;padding:0;width:100%;background:${EMAIL.app};color:${EMAIL.cream}" bgcolor="${EMAIL.app}">
${emailPreheader(input.preview)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${EMAIL.app}" style="width:100%;background:${EMAIL.app}">
  <tr>
    <td align="center" style="padding:0;background:${EMAIL.app}" bgcolor="${EMAIL.app}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:540px;background:${EMAIL.app}">
        <tr>
          <td style="height:2px;background:${EMAIL.gold};font-size:0;line-height:0">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:48px 28px 52px 28px;background:${EMAIL.app}">
            <img src="${EMAIL.lockup}" width="156" height="29" alt="Upside Lab" style="display:block;border:0" />
            ${opener}
            ${date}
            ${input.body}
            ${footer}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function fallbackNoteHtml(text: string): string {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const last = blocks[blocks.length - 1];
  const body = blocks
    .map((block, i) => {
      const muted =
        block === last &&
        (/Turn these notes off/i.test(block) || /one-time note/i.test(block));
      const style = muted
        ? `margin:28px 0 0 0;font-family:${EMAIL.sans};font-size:12px;line-height:1.5;color:${EMAIL.muted}`
        : i === 0
          ? `margin:36px 0 0 0;font-family:${EMAIL.serif};font-size:20px;line-height:1.45;font-weight:400;color:${EMAIL.cream}`
          : `margin:16px 0 0 0;font-family:${EMAIL.serif};font-size:16px;line-height:1.55;color:${EMAIL.cream}`;
      return `<p style="${style}">${escapeEmail(block).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
  const preview = blocks[0] ?? "Upside Lab";
  return wrapEmailLetter({
    title: "Upside Lab",
    preview,
    body,
    hideOpener: true,
  });
}

export function communityInviteCopy(input: {
  name: string;
  url: string;
  classroom: boolean;
}): { subject: string; text: string; html: string } {
  const name = input.name.trim() || (input.classroom ? "a class" : "a community");
  const subject = `Join ${name}`;
  const lead = input.classroom
    ? `You've been invited into ${name}. Sign in with Google and you get a paper portfolio to work from.`
    : `You've been invited into ${name}. Sign in with Google and pick which portfolios to share. Today's prices only.`;
  const text = [
    lead,
    input.url,
    "If you didn't expect this, ignore it.",
  ].join("\n\n");
  const html = wrapEmailLetter({
    title: subject,
    preview: lead,
    hideOpener: true,
    body: `${emailKicker("Invite")}
<div style="height:18px;font-size:0;line-height:0">&nbsp;</div>
<p style="margin:0;font-family:${EMAIL.serif};font-size:26px;line-height:1.25;font-weight:400;letter-spacing:-0.02em;color:${EMAIL.cream}">Join ${escapeEmail(name)}</p>
<p style="margin:22px 0 0 0;font-family:${EMAIL.serif};font-size:17px;line-height:1.55;color:${EMAIL.cream}">${escapeEmail(lead)}</p>
${emailButton(input.url, "Open the invite")}
<p style="margin:28px 0 0 0;font-family:${EMAIL.sans};font-size:12px;line-height:1.5;color:${EMAIL.muted}">If you didn't expect this, ignore it.</p>`,
  });
  return { subject, text, html };
}

export function emptyBookNudgeHtml(text: string): string {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const preview = blocks[0] ?? "Your portfolio is still empty";
  const bodyBlocks = blocks.filter(
    (b) =>
      !/^https?:\/\//i.test(b) &&
      !/one-time note/i.test(b) &&
      b !== preview
  );
  const prose = bodyBlocks
    .map(
      (block, i) =>
        `<p style="margin:${i === 0 ? "22px" : "16px"} 0 0 0;font-family:${EMAIL.serif};font-size:17px;line-height:1.55;color:${EMAIL.cream}">${escapeEmail(block)}</p>`
    )
    .join("");
  return wrapEmailLetter({
    title: preview,
    preview,
    hideOpener: true,
    body: `${emailKicker("A note")}
<div style="height:18px;font-size:0;line-height:0">&nbsp;</div>
<p style="margin:0;font-family:${EMAIL.serif};font-size:26px;line-height:1.25;font-weight:400;letter-spacing:-0.02em;color:${EMAIL.cream}">${escapeEmail(preview)}</p>
${prose}
${emailButton(EMAIL.origin, "Open Upside Lab")}
<p style="margin:28px 0 0 0;font-family:${EMAIL.sans};font-size:12px;line-height:1.5;color:${EMAIL.muted}">This is a one-time note. Weekday and Sunday emails start once there are names in your portfolio. Turn notes off in <a href="${EMAIL.origin}/account" style="color:${EMAIL.gold};text-decoration:underline">Account</a>.</p>`,
  });
}
