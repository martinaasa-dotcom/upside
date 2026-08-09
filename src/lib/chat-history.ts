import type { UIMessage } from "ai";

const STORAGE_KEY = "portfell-chat-by-portfolio";

type ChatByPortfolio = Record<string, UIMessage[]>;

function readAll(): ChatByPortfolio {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ChatByPortfolio;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(all: ChatByPortfolio) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Quota / private mode — drop oldest-looking oversized payloads by clearing files
    try {
      const slim: ChatByPortfolio = {};
      for (const [id, msgs] of Object.entries(all)) {
        slim[id] = msgs.map(stripHeavyParts);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch {
      /* ignore */
    }
  }
}

/** Drop large image payloads so history fits in localStorage. */
function stripHeavyParts(message: UIMessage): UIMessage {
  return {
    ...message,
    parts: message.parts.map((part) => {
      if (
        part.type === "file" &&
        "url" in part &&
        typeof part.url === "string" &&
        part.url.startsWith("data:")
      ) {
        return {
          ...part,
          url: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
        };
      }
      return part;
    }),
  };
}

export function loadChatHistory(portfolioId: string): UIMessage[] {
  if (!portfolioId) return [];
  const msgs = readAll()[portfolioId];
  return Array.isArray(msgs) ? msgs : [];
}

export function saveChatHistory(portfolioId: string, messages: UIMessage[]) {
  if (!portfolioId) return;
  const all = readAll();
  if (messages.length === 0) {
    delete all[portfolioId];
  } else {
    all[portfolioId] = messages.map(stripHeavyParts);
  }
  writeAll(all);
}

export function clearChatHistory(portfolioId: string) {
  if (!portfolioId) return;
  const all = readAll();
  delete all[portfolioId];
  writeAll(all);
}

export function collectAppliedToolIds(messages: UIMessage[]): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts as Array<{ toolCallId?: string }>) {
      if (part.toolCallId) ids.add(part.toolCallId);
    }
  }
  return ids;
}
