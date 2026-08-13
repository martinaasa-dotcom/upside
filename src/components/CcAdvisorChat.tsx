"use client";

import { track } from "@vercel/analytics";
import type { CcChatContext } from "@/lib/ai/cc-advisor";
import { STRATEGY } from "@/lib/calculations";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import {
  collectAppliedToolIds,
  loadChatHistory,
  saveChatHistory,
} from "@/lib/chat-history";
import {
  clipboardImagesToParts,
  fileToImagePart,
} from "@/lib/chat-images";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart } from "ai";
import {
  BookOpen,
  ImagePlus,
  Loader2,
  Maximize2,
  Minimize2,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type AdvisorAction =
  | { action: "set_call_pct"; ticker: string; callPct: number }
  | {
      action: "set_call_pct_bulk";
      updates: Array<{ ticker: string; callPct: number }>;
    }
  | { action: "set_uniform_call_pct"; callPct: number }
  | {
      action: "update_holding";
      ticker: string;
      shares: number | null;
      buyPrice: number | null;
    }
  | { action: "set_cash"; cash: number }
  | {
      action: "add_holding";
      ticker: string;
      shares: number;
      buyPrice: number;
      callPct: number;
    }
  | {
      action: "import_sheet";
      cash: number | null;
      replace?: boolean;
      holdings: Array<{
        ticker: string;
        shares: number;
        buyPrice: number;
        callPct: number;
      }>;
    }
  | { action: "remove_holding"; ticker: string }
  | { action: "set_stock_target"; ticker: string; stockTarget: number }
  | {
      action: "set_stock_target_bulk";
      updates: Array<{ ticker: string; stockTarget: number }>;
    }
  | { action: "clear_stock_target"; ticker: string }
  | { action: "propose_write_plan"; plans: unknown[]; message: string }
  | {
      action: "apply_write_plan";
      updates: Array<{
        ticker: string;
        stockTarget: number;
        callPct: number;
      }>;
    };

type Props = {
  /** Active sheet — chat history is scoped to this id. */
  portfolioId: string;
  context: CcChatContext;
  onApplyActions: (actions: AdvisorAction[]) => void;
  /** Bump to open the floating Margus panel (empty-state / drawer CTAs). */
  expandSignal?: number;
  /** Bump to trigger the image file picker and import silently — no chat
   * panel opens; progress shows in a small status card instead. Picking a
   * screenshot here sends straight away, it never stages in a compose box. */
  imagePickSignal?: number;
};

/** Default instruction sent with a screenshot import — same for both the
 * silent (picker) and interactive (typed-in-chat) paths. Phrased as a
 * standing command rather than relying purely on the API's tool_choice
 * param — some providers in the fallback chain don't reliably honor a
 * forced tool choice and will just describe the image in prose instead,
 * so the prompt itself has to make "call the tool, don't just narrate"
 * unambiguous. */
const DEFAULT_SCREENSHOT_PROMPT =
  "Read this broker screenshot carefully, then take action. Do not just describe it. If it is a single ticker (Shares + Avg buy), call the addHolding tool with those exact numbers and the correct currency (€=EUR). If it is a multi-row portfolio table, call the importSheet tool for every row. You must call one of these tools before replying; only after that, briefly confirm what you saved.";

type ToolPart = {
  type: string;
  toolCallId?: string;
  state?: string;
  output?: unknown;
};

function extractText(parts: Array<{ type: string; text?: string }>) {
  return parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("");
}

function extractImages(
  parts: Array<{ type: string; url?: string; mediaType?: string }>
): Array<{ url: string; mediaType: string }> {
  return parts
    .filter(
      (p) =>
        p.type === "file" &&
        typeof p.url === "string" &&
        typeof p.mediaType === "string" &&
        p.mediaType.startsWith("image/")
    )
    .map((p) => ({ url: p.url!, mediaType: p.mediaType! }));
}

/** Shared with the silent-import status card so the two surfaces never
 * disagree on what a given error means. Mirrors describeAdvisorError's
 * provider-agnostic framing server-side — this used to hardcode
 * OpenRouter specifically, which was actively misleading once Groq/
 * Gemini/Cerebras fallbacks existed (it'd tell you to add a key you
 * already have while the real issue was a different provider). */
function describeChatUiError(message: string): string {
  if (/free-models-per-day|models-per-day/i.test(message)) {
    return "OpenRouter's free daily quota is used up for today. Add a Groq/Gemini/Cerebras free key for a fallback, or try again after it resets.";
  }
  if (/OPENROUTER|GROQ|GEMINI|CEREBRAS|API key|503|LLM/i.test(message)) {
    return "Every configured AI provider failed or is rate-limited right now. Wait a bit and try again, or add another free provider key (Groq/Gemini/Cerebras) in .env.local for a fallback.";
  }
  if (/network|fetch|Failed to fetch|Load failed|aborted/i.test(message)) {
    return "Connection dropped (dev server restart or a long reply). Refresh the page and try again.";
  }
  return message;
}

function isMdSepCell(cell: string): boolean {
  return /^:?-{3,}:?$/.test(cell.trim());
}

/**
 * Rebuild a single jammed pipe line into a real GFM table.
 * Avoids half-matching `| --- |` out of `| --- | --- | --- |` (that left a tiny 1-col box).
 *
 * Small tables (2–3 columns, 1 data row) were previously missed because the
 * old gate required 8+ pipes — a jammed 2-column table (`| h1 | h2 | --- |
 * --- | r1 | r2 |`) only has 7. The gate is now just a cheap "could this
 * possibly be one" pre-check; the real safety net is requiring at least one
 * non-empty data cell after the separator, so a lone data row that happens
 * to use literal `---` placeholder cells is never mistaken for a jammed
 * header+separator (which would otherwise swallow that row with no body).
 */
function expandJammedTableLine(line: string): string {
  const pipeCount = (line.match(/\|/g) ?? []).length;
  if (pipeCount < 6 || !/-{3,}/.test(line)) return line;

  const raw = line.split("|").map((s) => s.trim());
  if (raw[0] === "") raw.shift();
  if (raw.length && raw[raw.length - 1] === "") raw.pop();
  const parts = raw;

  const sepStart = parts.findIndex(isMdSepCell);
  if (sepStart < 0) return line;

  let sepCount = 0;
  for (let i = sepStart; i < parts.length && isMdSepCell(parts[i]); i++) {
    sepCount++;
  }
  if (sepCount < 2) return line;

  const header = parts.slice(0, sepStart);
  const body = parts.slice(sepStart + sepCount);
  if (!body.some((c) => c.length > 0)) return line;

  const cols = Math.max(sepCount, header.length, 2);

  const pad = (row: string[]) => {
    const next = row.slice(0, cols);
    while (next.length < cols) next.push("");
    return next;
  };

  const rows: string[][] = [];
  if (header.some((c) => c.length > 0)) rows.push(pad(header));
  rows.push(Array.from({ length: cols }, () => "---"));
  for (let i = 0; i < body.length; i += cols) {
    const slice = body.slice(i, i + cols);
    if (slice.every((c) => c === "")) continue;
    rows.push(pad(slice));
  }

  if (rows.length < 2) return line;
  return rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
}

/** Fix jammed GFM tables + other common free-model markdown breakage. */
function normalizeMargusMarkdown(src: string): string {
  let text = src.replace(/\r\n/g, "\n");

  // Some models escape line breaks as literal backslash-n instead of real
  // newlines, producing an unreadable wall of text. Only fire when there
  // are barely any real newlines but several literal ones, so we never
  // touch normal prose that happens to mention "\n".
  const realNewlines = (text.match(/\n/g) ?? []).length;
  const literalNewlines = (text.match(/\\n/g) ?? []).length;
  if (literalNewlines >= 2 && realNewlines <= 1) {
    text = text.replace(/\\n/g, "\n");
  }

  text = text
    .split("\n")
    .map((line) => expandJammedTableLine(line))
    .join("\n");

  // Drop truly orphaned separator crumbs (bad model output / old normalizer)
  // — but NOT a separator row that legitimately follows a header row, which
  // is required GFM syntax. A blanket regex here was deleting the separator
  // line `expandJammedTableLine` had just generated, leaving a header +
  // data rows with no delimiter in between — remark-gfm then refuses to
  // parse it as a table at all, so it fell back to showing raw `| a | b |`
  // text. Only strip a separator-only line when the line above it has no
  // pipes at all (i.e. it can't be a header row).
  const lines = text.split("\n");
  text = lines
    .filter((line, i) => {
      const sepOnly = /^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line.trim());
      if (!sepOnly) return true;
      const prev = lines[i - 1] ?? "";
      return prev.includes("|");
    })
    .join("\n");

  // Headers jammed mid-paragraph instead of starting their own line.
  text = text.replace(/([^\n])\n?(#{1,6} [A-Za-z])/g, "$1\n\n$2");

  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function ChatMarkdown({ children }: { children: string }) {
  const md = normalizeMargusMarkdown(children);
  return (
    <div className="w-full min-w-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children: c }) => (
            <h3 className="mb-1.5 mt-3 text-sm font-semibold tracking-tight text-white first:mt-0">
              {c}
            </h3>
          ),
          h2: ({ children: c }) => (
            <h3 className="mb-1.5 mt-3 text-sm font-semibold tracking-tight text-white first:mt-0">
              {c}
            </h3>
          ),
          h3: ({ children: c }) => (
            <h4 className="mb-1 mt-2.5 text-[13px] font-semibold text-zinc-100 first:mt-0">
              {c}
            </h4>
          ),
          p: ({ children: c }) => (
            <p className="mb-2.5 break-words last:mb-0 text-[13px] leading-relaxed text-zinc-300">
              {c}
            </p>
          ),
          ul: ({ children: c }) => (
            <ul className="mb-2.5 list-disc space-y-1.5 pl-4 last:mb-0 text-[13px] text-zinc-300">
              {c}
            </ul>
          ),
          ol: ({ children: c }) => (
            <ol className="mb-2.5 list-decimal space-y-1.5 pl-4 last:mb-0 text-[13px] text-zinc-300">
              {c}
            </ol>
          ),
          li: ({ children: c }) => (
            <li className="break-words leading-relaxed marker:text-zinc-600">{c}</li>
          ),
          strong: ({ children: c }) => (
            <strong className="font-semibold text-white">{c}</strong>
          ),
          em: ({ children: c }) => (
            <em className="italic text-zinc-300">{c}</em>
          ),
          a: ({ href, children: c }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-brand underline underline-offset-2 hover:text-brand-bright"
            >
              {c}
            </a>
          ),
          code: ({ children: c, className }) => {
            const block = Boolean(className);
            if (block) {
              return (
                <code className="block w-full overflow-x-auto rounded-md bg-zinc-950/80 px-2 py-1.5 font-mono text-[11px] text-zinc-300">
                  {c}
                </code>
              );
            }
            return (
              <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[11px] text-brand-bright">
                {c}
              </code>
            );
          },
          pre: ({ children: c }) => (
            <pre className="mb-2.5 w-full overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-2 last:mb-0">
              {c}
            </pre>
          ),
          table: ({ children: c }) => (
            <div className="mb-3 w-full min-w-0 overflow-x-auto last:mb-0">
              <table className="w-full border-collapse text-left text-[12px]">
                {c}
              </table>
            </div>
          ),
          thead: ({ children: c }) => (
            <thead className="border-b border-zinc-700 text-[11px] uppercase tracking-wide text-zinc-500">
              {c}
            </thead>
          ),
          tbody: ({ children: c }) => (
            <tbody className="text-zinc-300">{c}</tbody>
          ),
          tr: ({ children: c }) => (
            <tr className="border-t border-zinc-800/90 first:border-t-0">{c}</tr>
          ),
          th: ({ children: c }) => (
            <th className="whitespace-nowrap py-2 pr-3 text-left font-medium first:pl-0">
              {c}
            </th>
          ),
          td: ({ children: c }) => (
            <td className="break-words py-2 pr-3 align-top tabular-nums text-zinc-300 first:pl-0">
              {c}
            </td>
          ),
          hr: () => <hr className="my-3 border-zinc-800" />,
          blockquote: ({ children: c }) => (
            <blockquote className="mb-2.5 break-words border-l-2 border-brand/40 pl-3 text-[13px] text-zinc-400 last:mb-0">
              {c}
            </blockquote>
          ),
        }}
      >
        {md}
      </ReactMarkdown>
    </div>
  );
}

const WIDE_KEY = "upside-margus-wide";

function loadWidePref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(WIDE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveWidePref(wide: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WIDE_KEY, wide ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

const ACTION_TYPES = new Set([
  "tool-setCallPct",
  "tool-setCallPctBulk",
  "tool-setUniformCallPct",
  "tool-updateHolding",
  "tool-setCash",
  "tool-addHolding",
  "tool-importSheet",
  "tool-removeHolding",
  "tool-setStockTarget",
  "tool-setStockTargetBulk",
  "tool-clearStockTarget",
  "tool-proposeWritePlan",
  "tool-applyWritePlan",
]);

const RULES = [
  {
    title: "Table meaning",
    rule: "Stock Target ≠ strike",
    detail:
      "Stock Target = write level. Call % = buffer above that. Next Strike = Target × (1+Call%). Distance = Spot→Target (not OTM). Premium uses Next Strike.",
  },
  {
    title: "Market condition",
    rule: "Intraday green rebound",
    detail: "Prefer selling calls when the name is green. Avoid dumping strikes on red days.",
  },
  {
    title: "Contract duration",
    rule: `${STRATEGY.minDaysPreferred}–${STRATEGY.maxDaysPreferred} days (~2–3 weeks)`,
    detail: `Can extend up to ~${STRATEGY.maxDaysExtended}d when earnings forces a longer dated.`,
  },
  {
    title: "Call %",
    rule: "Scaled to each ticker's own volatility",
    detail: `Roughly ${(STRATEGY.callPctSafeMin * 100).toFixed(0)}–${(STRATEGY.callPctSafeMax * 100).toFixed(0)}% for low-vol names up to ${(STRATEGY.callPctHighBeta * 100).toFixed(0)}%+ for high-beta ones, nudged for earnings / distance. Never one flat "safety" % for the whole book.`,
  },
  {
    title: "Earnings",
    rule: "Prefer expire before earnings",
    detail: "If no clean pre-earnings 2–3w expiry, go past earnings and widen Call %.",
  },
  {
    title: "Yield",
    rule: `Target ~${(STRATEGY.targetYield * 100).toFixed(0)}% (floor ${(STRATEGY.minYield * 100).toFixed(0)}%)`,
    detail: "Margus estimates from live option mid/spot for the chosen Next Strike & expiry when available.",
  },
  {
    title: "Execution window",
    rule: STRATEGY.executionWindow,
    detail: "Skip the first ~15 min after the US open; fill when spreads are tighter.",
  },
  {
    title: "What Margus can change",
    rule: "Shares, cash, Call %, Stock Target, sheet imports, write plans",
    detail:
      "Paste a spreadsheet screenshot and Margus should import every equity row via importSheet. Critique uses your table values.",
  },
] as const;

export function CcAdvisorChat({
  portfolioId,
  context,
  onApplyActions,
  expandSignal = 0,
  imagePickSignal = 0,
}: Props) {
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<FileUIPart[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  // Screenshot imports triggered via imagePickSignal never open the chat
  // panel — they send immediately and report progress through this small
  // status card instead. "sending" while in flight, "result" once settled
  // (kept on screen briefly for ok/info, until dismissed for errors).
  const [silentPhase, setSilentPhase] = useState<"idle" | "sending" | "result">(
    "idle"
  );
  const [silentSummary, setSilentSummary] = useState<{
    kind: "ok" | "info" | "empty" | "error";
    lines: string[];
  } | null>(null);
  const silentFileInputRef = useRef<HTMLInputElement>(null);
  const awaitingSilentSettleRef = useRef(false);

  useEffect(() => {
    setWide(loadWidePref());
  }, []);

  function toggleWide() {
    setWide((prev) => {
      const next = !prev;
      saveWidePref(next);
      return next;
    });
  }
  const initialMessages = useMemo(
    () => loadChatHistory(portfolioId),
    [portfolioId]
  );
  const appliedIds = useRef(collectAppliedToolIds(initialMessages));
  const contextRef = useRef(context);
  contextRef.current = context;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const rulesRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!expandSignal) return;
    setOpen(true);
  }, [expandSignal]);

  useEffect(() => {
    if (!imagePickSignal) return;
    // Deliberately does NOT open the chat panel — this input is always
    // mounted, so the OS picker opens immediately with no compose-box
    // detour. Import proceeds silently once a file is chosen.
    silentFileInputRef.current?.click();
  }, [imagePickSignal]);

  // Close on Escape when the panel is open (rules popover handles its own Esc).
  useEffect(() => {
    if (!open || rulesOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, rulesOpen]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, id, trigger, messageId }) => ({
          body: {
            messages,
            id,
            trigger,
            messageId,
            ccContext: contextRef.current,
          },
        }),
      }),
    []
  );

  const { messages, sendMessage, status, error, clearError, stop } = useChat({
    id: `margus-${portfolioId}`,
    messages: initialMessages,
    transport,
  });

  useEffect(() => {
    saveChatHistory(portfolioId, messages);
  }, [portfolioId, messages]);

  const busy = status === "submitted" || status === "streaming";
  const last = messages[messages.length - 1];
  const lastIsEmptyAssistant =
    !busy &&
    last?.role === "assistant" &&
    !extractText(last.parts as Array<{ type: string; text?: string }>) &&
    !(last.parts as ToolPart[]).some(
      (p) =>
        p.state === "output-available" &&
        typeof (p.output as { message?: string })?.message === "string"
    );

  // Capture the result of a silent screenshot import for the status card
  // once the request settles — one-shot per send via the ref guard.
  useEffect(() => {
    if (!awaitingSilentSettleRef.current || busy) return;
    awaitingSilentSettleRef.current = false;

    if (error) {
      setSilentSummary({ kind: "error", lines: [describeChatUiError(error.message)] });
      setSilentPhase("result");
      return;
    }

    if (!last || last.role !== "assistant") {
      setSilentSummary({
        kind: "empty",
        lines: ["Margus didn't confirm. Open chat to check what happened."],
      });
      setSilentPhase("result");
      return;
    }

    const toolNotes = (last.parts as ToolPart[])
      .filter(
        (p) =>
          p.state === "output-available" &&
          typeof (p.output as { message?: string })?.message === "string"
      )
      .map((p) => (p.output as { message: string }).message);
    const text = extractText(
      last.parts as Array<{ type: string; text?: string }>
    );

    if (toolNotes.length > 0) {
      setSilentSummary({ kind: "ok", lines: toolNotes });
    } else if (text) {
      // A screenshot import always asks for a forced tool call — text with
      // no tool call means nothing was actually saved, even though the
      // model answered normally (some providers in the fallback chain
      // don't reliably honor a forced tool choice and just narrate the
      // image instead). Flag it like "empty" so it reads as "this didn't
      // work" rather than a neutral update, while still showing what
      // Margus actually said.
      setSilentSummary({ kind: "empty", lines: [text] });
    } else {
      setSilentSummary({
        kind: "empty",
        lines: [
          "Margus returned an empty reply. Often a free-model rate limit. Open chat and try again.",
        ],
      });
    }
    setSilentPhase("result");
  }, [busy, error, last]);

  // Auto-dismiss the status card — success/info clears quickly, errors and
  // unclear reads stay up longer since the user may not be looking yet.
  useEffect(() => {
    if (silentPhase !== "result" || !silentSummary) return;
    const delay =
      silentSummary.kind === "error" || silentSummary.kind === "empty"
        ? 20000
        : 7000;
    const t = window.setTimeout(() => {
      setSilentPhase("idle");
      setSilentSummary(null);
    }, delay);
    return () => window.clearTimeout(t);
  }, [silentPhase, silentSummary]);

  useEffect(() => {
    const actions: AdvisorAction[] = [];

    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts as ToolPart[]) {
        if (!part.toolCallId || part.state !== "output-available") continue;
        if (appliedIds.current.has(part.toolCallId)) continue;
        if (!ACTION_TYPES.has(part.type)) continue;

        const output = part.output as AdvisorAction | undefined;
        if (!output?.action) continue;
        // Analysis-only — no portfolio mutation
        if (output.action === "propose_write_plan") {
          appliedIds.current.add(part.toolCallId);
          continue;
        }

        appliedIds.current.add(part.toolCallId);
        actions.push(output);
      }
    }

    if (actions.length) onApplyActions(actions);
  }, [messages, onApplyActions]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    if (!rulesOpen) return;
    function onDocClick(e: MouseEvent) {
      if (rulesRef.current && !rulesRef.current.contains(e.target as Node)) {
        setRulesOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setRulesOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [rulesOpen]);

  async function addImageFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    try {
      const parts = await Promise.all(list.map(fileToImagePart));
      setPendingImages((prev) => [...prev, ...parts].slice(0, 6));
    } catch (err) {
      console.error(err);
    }
  }

  async function onPaste(e: React.ClipboardEvent) {
    const parts = await clipboardImagesToParts(e.clipboardData?.items);
    if (!parts.length) return;
    e.preventDefault();
    setPendingImages((prev) => [...prev, ...parts].slice(0, 6));
  }

  async function handleSilentFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length || busy) return;
    clearError();
    setSilentSummary(null);
    setSilentPhase("sending");
    awaitingSilentSettleRef.current = true;
    try {
      const parts = await Promise.all(list.map(fileToImagePart));
      track("margus_message", {
        has_image: true,
        guest: context.adviseOnly,
        silent: true,
      });
      await sendMessage({ text: DEFAULT_SCREENSHOT_PROMPT, files: parts });
    } catch (err) {
      awaitingSilentSettleRef.current = false;
      setSilentSummary({
        kind: "error",
        lines: [err instanceof Error ? err.message : "Couldn't read that image."],
      });
      setSilentPhase("result");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (busy) return;
    if (!text && pendingImages.length === 0) return;
    setInput("");
    const files = pendingImages;
    setPendingImages([]);
    clearError();
    track("margus_message", {
      has_image: files.length > 0,
      guest: context.adviseOnly,
    });
    await sendMessage({
      text: text || DEFAULT_SCREENSHOT_PROMPT,
      files: files.length ? files : undefined,
    });
  }

  const suggestions = context.adviseOnly
    ? [
        "What’s moving in premarket / after hours?",
        "Which names are the biggest overnight gaps?",
        "Any concentration risk across sheets?",
        "Which sheets are winning today?",
      ]
    : [
        "Give me the updated CC write plan",
        "Copy Call % and targets from another sheet",
        "What’s moving in premarket / after hours?",
        "Tighten Call % on the names with room",
      ];

  const canSend = !busy && (Boolean(input.trim()) || pendingImages.length > 0);
  // Suppressed while the full panel is open — that already shows the same
  // message live, so the compact card would just be a redundant echo.
  const showSilentCard = silentPhase !== "idle" && !open;

  return (
    <div className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[60] flex flex-col items-end gap-3">
      <input
        ref={silentFileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void handleSilentFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {showSilentCard && (
        <div
          role="status"
          className="pointer-events-auto w-[min(20rem,calc(100vw-1.5rem))] cursor-pointer overflow-hidden rounded-2xl border border-brand-deep/40 bg-[#161618] shadow-2xl shadow-black/60"
          onClick={() => setOpen(true)}
        >
          <div className="flex items-start gap-2.5 px-3.5 py-3">
            <div className="mt-0.5 rounded-lg bg-brand/10 p-1.5 text-brand">
              {silentPhase === "sending" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : silentSummary?.kind === "error" ? (
                <ImagePlus className="h-3.5 w-3.5 text-rose-400" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white">
                {silentPhase === "sending"
                  ? "Margus is reading your screenshot …"
                  : silentSummary?.kind === "error"
                    ? "Import failed"
                    : silentSummary?.kind === "empty"
                      ? "Not sure that landed"
                      : "Margus"}
              </p>
              {silentPhase === "sending" ? (
                <p className="mt-0.5 text-xs text-zinc-500">
                  Usually takes a few seconds.
                </p>
              ) : (
                <div className="mt-0.5 space-y-0.5">
                  {silentSummary?.lines.map((line, i) => (
                    <p
                      key={i}
                      className={`text-xs leading-relaxed ${
                        silentSummary.kind === "error"
                          ? "text-rose-300"
                          : silentSummary.kind === "empty"
                            ? "text-amber-200"
                            : "text-zinc-300"
                      }`}
                    >
                      {line}
                    </p>
                  ))}
                </div>
              )}
              {silentPhase === "result" && (
                <p className="mt-1 text-[11px] text-zinc-600">
                  Tap to open chat
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSilentPhase("idle");
                setSilentSummary(null);
              }}
              className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {open && (
        <section
          ref={panelRef}
          className={`pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-brand-deep/40 bg-[#161618] shadow-2xl shadow-black/60 transition-[width,height] duration-200 ease-out ${
            wide
              ? "w-[min(56rem,calc(100vw-1.5rem))]"
              : "w-[min(26rem,calc(100vw-1.5rem))]"
          }`}
          style={{
            height: wide
              ? "min(46rem, calc(100dvh - 6.5rem))"
              : "min(38rem, calc(100dvh - 6.5rem))",
          }}
          role="dialog"
          aria-label="Assistant Margus"
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-zinc-800/80 px-3 py-2.5">
            <div className="rounded-lg bg-brand/10 p-1.5 text-brand">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-white">
                Assistant Margus
              </h2>
              <p className="truncate text-xs text-zinc-500">
                {context.adviseOnly
                  ? "Advise-only · open a sheet to apply changes"
                  : `Chat for ${context.portfolioName}`}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleWide}
              className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
              aria-label={wide ? "Shrink Margus" : "Widen Margus"}
              title={wide ? "Shrink panel" : "Widen panel: more room for tables"}
            >
              {wide ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
            <div className="relative" ref={rulesRef}>
              <button
                type="button"
                onClick={() => setRulesOpen((o) => !o)}
                className={`rounded-lg p-1.5 transition ${
                  rulesOpen
                    ? "bg-brand/15 text-brand"
                    : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                }`}
                aria-label="Strategy rules"
                aria-expanded={rulesOpen}
              >
                <BookOpen className="h-4 w-4" />
              </button>
              {rulesOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-zinc-700 bg-zinc-950 p-3 shadow-2xl shadow-black/50">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Strategy rules
                    </p>
                    <button
                      type="button"
                      onClick={() => setRulesOpen(false)}
                      className="rounded p-3 text-zinc-500 hover:text-zinc-300 sm:p-0.5"
                      aria-label="Close rules"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <ul className="max-h-72 space-y-2.5 overflow-y-auto">
                    {RULES.map((r) => (
                      <li
                        key={r.title}
                        className="border-b border-zinc-800/80 pb-2.5 last:border-0 last:pb-0"
                      >
                        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                          {r.title}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-brand">
                          {r.rule}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                          {r.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2.5 border-t border-zinc-800/80 pt-2.5 text-[11px] leading-relaxed text-zinc-600">
                    {ADVICE_DISCLAIMER_SHORT}
                  </p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Close Margus"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <p className="shrink-0 border-b border-zinc-800/60 px-3 py-1.5 text-center text-[11px] leading-snug text-zinc-600">
            {ADVICE_DISCLAIMER_SHORT}
          </p>

          <div
            ref={scrollerRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
          >
            {messages.length === 0 && (
              <div className="space-y-3 rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 p-3">
                <p className="text-xs leading-relaxed text-zinc-400">
                  I can read holdings and covered calls, and update shares, buy
                  price, cash, Call %, or add/remove tickers. Open the book icon
                  for the strategy rules.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy}
                      onClick={() => sendMessage({ text: s })}
                      className="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-brand/40 hover:text-brand-bright disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => {
              const text = extractText(
                message.parts as Array<{ type: string; text?: string }>
              );
              const images = extractImages(
                message.parts as Array<{
                  type: string;
                  url?: string;
                  mediaType?: string;
                }>
              );
              const toolParts = message.parts as ToolPart[];
              const toolNotes = toolParts
                .filter(
                  (p) =>
                    p.state === "output-available" &&
                    typeof (p.output as { message?: string })?.message ===
                      "string"
                )
                .map((p) => (p.output as { message: string }).message);
              const toolPending = toolParts.some(
                (p) =>
                  p.toolCallId &&
                  p.state !== "output-available" &&
                  p.state !== "output-error"
              );

              if (
                !text &&
                !images.length &&
                toolNotes.length === 0 &&
                !toolPending
              )
                return null;

              return (
                <div
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "ml-0 max-w-[95%] rounded-lg bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 sm:ml-6"
                      : "w-full min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200"
                  }
                >
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    {message.role === "user" ? "You" : "Margus"}
                  </p>
                  {images.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {images.map((img, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={`${message.id}-img-${i}`}
                          src={img.url}
                          alt="Attached"
                          className="max-h-40 max-w-full rounded-md border border-zinc-700 object-contain"
                        />
                      ))}
                    </div>
                  )}
                  {text ? (
                    <div className="w-full min-w-0 text-sm leading-relaxed">
                      {message.role === "assistant" ? (
                        <ChatMarkdown>{text}</ChatMarkdown>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{text}</p>
                      )}
                    </div>
                  ) : null}
                  {toolPending && !text && toolNotes.length === 0 ? (
                    <p className="text-xs text-zinc-500">Running analysis …</p>
                  ) : null}
                  {toolNotes.map((note, i) => (
                    <p
                      key={i}
                      className="mt-1.5 whitespace-pre-wrap break-words text-xs font-medium text-brand"
                    >
                      {note}
                    </p>
                  ))}
                </div>
              );
            })}

            {busy && (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking …
                <button
                  type="button"
                  onClick={() => stop()}
                  className="ml-1 inline-flex items-center gap-1 rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-zinc-400 hover:border-rose-500/40 hover:text-rose-300"
                >
                  <Square className="h-2.5 w-2.5 fill-current" />
                  Stop
                </button>
              </div>
            )}

            {lastIsEmptyAssistant && !error && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                Margus returned an empty reply (often a free-model rate limit or
                a long screenshot import). Wait a few seconds and ask again.
                For broker sheets, say “import this portfolio breakdown”.
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
                {describeChatUiError(error.message)}
              </div>
            )}
          </div>

          <form
            onSubmit={onSubmit}
            className="flex shrink-0 flex-col gap-2 border-t border-zinc-800/80 p-3"
          >
            {pendingImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pendingImages.map((img, i) => (
                  <div
                    key={`${img.filename ?? "img"}-${i}`}
                    className="relative h-16 w-16 overflow-hidden rounded-md border border-zinc-700"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.filename ?? "Pending"}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setPendingImages((prev) =>
                          prev.filter((_, j) => j !== i)
                        )
                      }
                      className="absolute right-0.5 top-0.5 rounded bg-black/70 p-0.5 text-zinc-200 hover:text-white"
                      aria-label="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void addImageFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center rounded-lg border border-zinc-700 px-2.5 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-40"
                aria-label="Attach image"
                title="Attach screenshot"
              >
                <ImagePlus className="h-4 w-4" />
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => void onPaste(e)}
                placeholder="Paste a screenshot or ask Margus …"
                disabled={busy}
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-brand/50 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!canSend}
                className="inline-flex items-center justify-center rounded-lg bg-brand px-3 text-[#121214] hover:bg-brand-bright disabled:opacity-40"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="pointer-events-auto inline-flex h-14 w-14 items-center justify-center rounded-full border border-brand-mid/50 bg-brand-bright text-[#1a1510] shadow-lg shadow-black/40 transition hover:bg-[#F0E4C8] hover:scale-[1.03] active:scale-[0.97]"
        aria-label={open ? "Close Assistant Margus" : "Open Assistant Margus"}
        aria-expanded={open}
        title="Assistant Margus"
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>
    </div>
  );
}
