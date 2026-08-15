/**
 * Post-process Margus (and other LLM) prose so em dashes and other
 * AI-tell punctuation never reach the UI, even when the model ignores
 * the persona Voice rules.
 *
 * Safe for Markdown: only rewrites dash punctuation and a short list of
 * stock AI openers. Does not touch table pipes, cashtags, or code fences.
 */

const EM = "\u2014"; // —
const EN = "\u2013"; // –

/** Replace em/en dashes with natural punctuation a person would type. */
export function stripAiDashes(text: string): string {
  if (!text || (!text.includes(EM) && !text.includes(EN))) return text;

  let s = text;

  // Parenthetical aside: "foo — bar — baz" → "foo, bar, baz"
  s = s.replace(
    new RegExp(`\\s*${EM}\\s*([^${EM}\\n]+?)\\s*${EM}\\s*`, "g"),
    ", $1, "
  );

  // Remaining em dashes → comma (or period before a capital / cashtag).
  s = s.replace(new RegExp(`\\s*${EM}\\s*(?=[A-Z$])`, "g"), ". ");
  s = s.replace(new RegExp(`\\s*${EM}\\s*`, "g"), ", ");

  // En dash as a numeric range (2028–2029, 5–12%) → hyphen.
  s = s.replace(new RegExp(`(\\d)\\s*${EN}\\s*(\\d)`, "g"), "$1-$2");
  // Any other en dash used as a clause break → comma.
  s = s.replace(new RegExp(`\\s*${EN}\\s*`, "g"), ", ");

  // Tidy doubles from overlapping replacements.
  s = s.replace(/,\s*,+/g, ", ");
  s = s.replace(/\.\s*\.+/g, ". ");
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/ +([.,])/g, "$1");

  // Capitalize after a sentence break we introduced.
  s = s.replace(/\.\s+([a-z])/g, (_, c: string) => `. ${c.toUpperCase()}`);

  return s.trim();
}

const AI_OPENERS: Array<[RegExp, string]> = [
  [/^it'?s important to note that\s+/i, ""],
  [/^it is worth noting that\s+/i, ""],
  [/^in today'?s fast[- ]paced(?:\s+\w+)?[,]?\s+/i, ""],
  [/^at the end of the day[,]?\s+/i, ""],
  [/^when all is said and done[,]?\s+/i, ""],
  [/\bnot just\s+([^,.;]+),\s+but\s+/gi, "$1, and "],
];

/** Light scrub of stock AI openers; keeps the rest of the sentence. */
export function scrubAiPhrases(text: string): string {
  if (!text) return text;
  let s = text;
  let strippedLead = false;
  for (const [re, rep] of AI_OPENERS) {
    const next = s.replace(re, rep);
    if (next !== s) {
      s = next;
      if (re.source.startsWith("^")) strippedLead = true;
    }
  }
  if (!s) return text;
  // Only recapitalize when we actually ate a leading opener. Doing this
  // to every string turned Pulse enums (`intact`, `hold`) into `Intact` /
  // `Hold`, which the badge code then treated as unknown and painted
  // "Thesis at risk" on a fully intact Hold card.
  if (strippedLead) {
    return s.replace(/^[a-z]/, (c) => c.toUpperCase());
  }
  return s;
}

/** Kill leftover market slang the model still emits. */
function scrubMarketJargon(text: string): string {
  if (!text) return text;
  let s = text;
  s = s.replace(/\bbest tape\b/gi, "biggest gainer");
  s = s.replace(/\bworst tape\b/gi, "biggest drop");
  s = s.replace(/\bon the tape\b/gi, "in the prices");
  s = s.replace(/\bthe tape\b/gi, "prices");
  return s;
}

/** Full pass for a single Margus string. */
export function humanizeMargusText(text: string): string {
  if (!text) return text;
  return scrubAiPhrases(stripAiDashes(scrubMarketJargon(text)));
}

/**
 * Keys that are codes, not prose. Running the sentence sanitizer on them
 * title-cases enums and breaks every `=== "intact"` check downstream.
 */
const LEAVE_ALONE = new Set([
  "thesisStatus",
  "action",
  "ticker",
  "id",
  "kind",
  "type",
  "generatedAt",
  "cachedAt",
  "publishedAt",
  "link",
  "url",
]);

/**
 * Recursively humanize every string in a plain object / array tree
 * (forecast plans, pulse reports, fund decisions, etc.).
 */
export function humanizeMargusTree<T>(value: T): T {
  if (typeof value === "string") {
    return humanizeMargusText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => humanizeMargusTree(v)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = LEAVE_ALONE.has(k) ? v : humanizeMargusTree(v);
    }
    return out as T;
  }
  return value;
}
