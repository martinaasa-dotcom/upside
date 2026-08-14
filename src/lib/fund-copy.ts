import { humanizeMargusText } from "@/lib/ai/humanize-copy";

const MAX_BULLETS = 4;
const MAX_WORDS = 16;

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tidy(part: string): string {
  let s = part.trim().replace(/^[.;,\s]+|[.;,\s]+$/g, "");
  s = s.replace(/^sell if\s+/i, "");
  s = s.replace(/^if\s+/i, "");
  s = s.replace(/\bremaining performance obligations\s*\(RPO\)/gi, "RPO");
  s = s.replace(/\bfails to exceed\b/gi, "below");
  s = s.replace(/\bdecelerates below\b/gi, "below");
  s = s.replace(/^signaling\s+/i, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";
  return capitalize(humanizeMargusText(s));
}

function splitClause(part: string): string[] {
  const signaling = part.split(/\s*,\s*signaling\s+/i);
  if (signaling.length > 1) {
    return signaling.flatMap(splitClause);
  }
  const asMatch = part.match(/^(.*?)\s+as\s+(.+)$/i);
  if (
    asMatch?.[1] &&
    asMatch[2] &&
    asMatch[1].split(/\s+/).length >= 3 &&
    asMatch[2].split(/\s+/).length >= 4
  ) {
    return [asMatch[1], asMatch[2]];
  }
  return [part];
}

function clipWords(s: string): string {
  const words = s.split(/\s+/);
  if (words.length <= MAX_WORDS) return s;
  return `${words.slice(0, MAX_WORDS).join(" ")}`;
}

/**
 * Thesis and exit plans used to land as one paragraph. Cards need short
 * bullets. Splits on the separators Margus already uses (; / or if), then
 * trims filler so existing rows read as a list without a rewrite.
 */
export function fundCopyBullets(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  const chunks = text
    .split(/\s*;\s*|\s+or if\s+/i)
    .flatMap(splitClause)
    .map(tidy)
    .filter(Boolean)
    .map(clipWords);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chunks) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= MAX_BULLETS) break;
  }
  return out;
}

const RECAP_MAX = 6;
const RECAP_WORDS = 18;

function clipRecap(s: string): string {
  const words = s.split(/\s+/);
  if (words.length <= RECAP_WORDS) return s;
  return words.slice(0, RECAP_WORDS).join(" ");
}

/**
 * Daily / weekly fund prose as a short list. Works on stored paragraphs
 * so old recaps tighten up without waiting for the next cron.
 */
export function recapBullets(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  const chunks = text
    .split(/\n+/)
    .flatMap((line) => {
      const stripped = line
        .replace(/^[-*•]\s+/, "")
        .replace(/\*+/g, "")
        .trim();
      if (!stripped) return [];
      return stripped.split(/(?<=[.!?])\s+/);
    })
    .flatMap(splitClause)
    .map(tidy)
    .filter((s) => s.length >= 8)
    .map(clipRecap);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chunks) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= RECAP_MAX) break;
  }
  return out;
}
