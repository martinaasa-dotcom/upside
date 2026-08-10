"use client";

import type { CcChatContext } from "@/lib/ai/cc-advisor";
import { STRATEGY, formatCallPctBaselines } from "@/lib/calculations";
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
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

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
};

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

function ChatMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children: c }) => (
          <h3 className="mb-1.5 mt-2 text-sm font-semibold text-white first:mt-0">
            {c}
          </h3>
        ),
        h2: ({ children: c }) => (
          <h3 className="mb-1.5 mt-2 text-sm font-semibold text-white first:mt-0">
            {c}
          </h3>
        ),
        h3: ({ children: c }) => (
          <h4 className="mb-1 mt-2 text-sm font-semibold text-zinc-100 first:mt-0">
            {c}
          </h4>
        ),
        p: ({ children: c }) => (
          <p className="mb-2 last:mb-0 leading-relaxed text-zinc-200">{c}</p>
        ),
        ul: ({ children: c }) => (
          <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0 text-zinc-200">
            {c}
          </ul>
        ),
        ol: ({ children: c }) => (
          <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0 text-zinc-200">
            {c}
          </ol>
        ),
        li: ({ children: c }) => <li className="leading-relaxed">{c}</li>,
        strong: ({ children: c }) => (
          <strong className="font-semibold text-white">{c}</strong>
        ),
        em: ({ children: c }) => <em className="italic text-zinc-300">{c}</em>,
        a: ({ href, children: c }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
          >
            {c}
          </a>
        ),
        code: ({ children: c, className }) => {
          const block = Boolean(className);
          if (block) {
            return (
              <code className="block overflow-x-auto rounded-md bg-zinc-950/80 px-2 py-1.5 font-mono text-[11px] text-zinc-300">
                {c}
              </code>
            );
          }
          return (
            <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[11px] text-emerald-300">
              {c}
            </code>
          );
        },
        pre: ({ children: c }) => (
          <pre className="mb-2 overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950/80 p-2 last:mb-0">
            {c}
          </pre>
        ),
        table: ({ children: c }) => (
          <div className="mb-2 overflow-x-auto last:mb-0">
            <table className="w-full border-collapse text-left text-xs">
              {c}
            </table>
          </div>
        ),
        thead: ({ children: c }) => (
          <thead className="border-b border-zinc-700 text-zinc-400">{c}</thead>
        ),
        th: ({ children: c }) => (
          <th className="px-2 py-1 font-medium">{c}</th>
        ),
        td: ({ children: c }) => (
          <td className="border-t border-zinc-800/80 px-2 py-1 text-zinc-300">
            {c}
          </td>
        ),
        hr: () => <hr className="my-2 border-zinc-800" />,
        blockquote: ({ children: c }) => (
          <blockquote className="mb-2 border-l-2 border-emerald-500/40 pl-2 text-zinc-400 last:mb-0">
            {c}
          </blockquote>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

const ACTION_TYPES = new Set([
  "tool-setCallPct",
  "tool-setCallPctBulk",
  "tool-setUniformCallPct",
  "tool-updateHolding",
  "tool-setCash",
  "tool-addHolding",
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
    detail: "Prefer selling calls when the name is green — avoid dumping strikes on red days.",
  },
  {
    title: "Contract duration",
    rule: `${STRATEGY.minDaysPreferred}–${STRATEGY.maxDaysPreferred} days (~2–3 weeks)`,
    detail: `Can extend up to ~${STRATEGY.maxDaysExtended}d when earnings forces a longer dated.`,
  },
  {
    title: "Call %",
    rule: "Volatility baselines per ticker",
    detail: `House set: ${formatCallPctBaselines()}. Nudge for earnings / distance — never flatten the book to one “safety” %.`,
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
    rule: "Shares, cash, Call %, Stock Target, write plans",
    detail: "Critique uses your table values. Re-pick local highs only when you ask to rebuild.",
  },
] as const;

export function CcAdvisorChat({
  portfolioId,
  context,
  onApplyActions,
}: Props) {
  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<FileUIPart[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const initialMessages = useMemo(
    () => loadChatHistory(portfolioId),
    [portfolioId]
  );
  const appliedIds = useRef(collectAppliedToolIds(initialMessages));
  const contextRef = useRef(context);
  contextRef.current = context;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rulesRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (busy) return;
    if (!text && pendingImages.length === 0) return;
    setInput("");
    const files = pendingImages;
    setPendingImages([]);
    clearError();
    await sendMessage({
      text:
        text ||
        "Please read this screenshot and update the portfolio / CC targets to match.",
      files: files.length ? files : undefined,
    });
  }

  const suggestions = [
    "Give me the updated CC write plan",
    "Copy Call % and targets from another sheet",
    "Which names should wait for earnings?",
    "Tighten Call % on the names with room",
  ];

  const canSend = !busy && (Boolean(input.trim()) || pendingImages.length > 0);

  return (
    <section className="relative flex h-[630px] flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/40">
      <header className="flex shrink-0 items-center gap-2 border-b border-zinc-800/80 px-4 py-3">
        <div className="rounded-lg bg-emerald-500/10 p-1.5 text-emerald-400">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-white">Assistant Margus</h2>
          <p className="truncate text-xs text-zinc-500">
            {context.adviseOnly
              ? "Advise-only overview · open a sheet to apply changes"
              : `Chat for ${context.portfolioName} · other sheets only when you ask`}
          </p>
        </div>
        <div className="relative" ref={rulesRef}>
          <button
            type="button"
            onClick={() => setRulesOpen((o) => !o)}
            className={`rounded-lg p-1.5 transition ${
              rulesOpen
                ? "bg-emerald-500/15 text-emerald-400"
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
                  House rules
                </p>
                <button
                  type="button"
                  onClick={() => setRulesOpen(false)}
                  className="rounded p-0.5 text-zinc-500 hover:text-zinc-300"
                  aria-label="Close rules"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <ul className="max-h-72 space-y-2.5 overflow-y-auto">
                {RULES.map((r) => (
                  <li key={r.title} className="border-b border-zinc-800/80 pb-2.5 last:border-0 last:pb-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                      {r.title}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-emerald-400">
                      {r.rule}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                      {r.detail}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </header>

      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
      >
        {messages.length === 0 && (
          <div className="space-y-3 rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 p-3">
            <p className="text-xs leading-relaxed text-zinc-400">
              I can read holdings and covered calls, and update shares, buy
              price, cash, Call %, or add/remove tickers. Open the book icon for
              house rules.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => sendMessage({ text: s })}
                  className="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-50"
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
                typeof (p.output as { message?: string })?.message === "string"
            )
            .map((p) => (p.output as { message: string }).message);
          const toolPending = toolParts.some(
            (p) =>
              p.toolCallId &&
              p.state !== "output-available" &&
              p.state !== "output-error"
          );

          if (!text && !images.length && toolNotes.length === 0 && !toolPending)
            return null;

          return (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "ml-6 rounded-lg bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100"
                  : "mr-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200"
              }
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
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
                <div className="max-h-56 overflow-y-auto text-sm leading-relaxed">
                  {message.role === "assistant" ? (
                    <ChatMarkdown>{text}</ChatMarkdown>
                  ) : (
                    <p className="whitespace-pre-wrap">{text}</p>
                  )}
                </div>
              ) : null}
              {toolPending && !text && toolNotes.length === 0 ? (
                <p className="text-xs text-zinc-500">Running analysis…</p>
              ) : null}
              {toolNotes.map((note, i) => (
                <p
                  key={i}
                  className="mt-1.5 whitespace-pre-wrap text-xs font-medium text-emerald-400"
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
            Thinking…
            <button
              type="button"
              onClick={() => stop()}
              className="ml-1 inline-flex items-center gap-1 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400 hover:border-rose-500/40 hover:text-rose-300"
            >
              <Square className="h-2.5 w-2.5 fill-current" />
              Stop
            </button>
          </div>
        )}

        {lastIsEmptyAssistant && !error && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
            Margus returned an empty reply (often a free-model rate limit). Wait a
            few seconds and ask again.
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
            {/OPENROUTER|GROQ|API key|503|LLM/i.test(error.message)
              ? "Add OPENROUTER_API_KEY to .env.local (https://openrouter.ai/keys), then restart the dev server."
              : /network|fetch|Failed to fetch|Load failed|aborted/i.test(
                    error.message
                  )
                ? "Connection dropped (dev server restart or a long reply). Refresh the page and ask again — critiques can take ~30–60s on the Super model."
                : error.message}
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
                    setPendingImages((prev) => prev.filter((_, j) => j !== i))
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
            placeholder="Paste a screenshot or ask Margus…"
            disabled={busy}
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-3 text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </section>
  );
}
