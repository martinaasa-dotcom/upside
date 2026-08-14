import type { PulseAction, PulseCheck, ThesisStatus } from "@/lib/thesis-pulse";

const KEY = "upside-pulse-history-v1";
const MAX_PER_TICKER = 12;

export type PulseHistoryEntry = {
  at: string;
  action: PulseAction;
  thesisStatus: ThesisStatus;
  verdict: string;
};

type Store = Record<string, PulseHistoryEntry[]>;

function loadStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveStore(store: Store) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

/** Keep a timeline when the call actually changed, not every hourly refresh. */
export function recordPulseHistory(check: PulseCheck, at = new Date().toISOString()) {
  const ticker = check.ticker.trim().toUpperCase();
  const store = loadStore();
  const prev = store[ticker] ?? [];
  const last = prev[prev.length - 1];
  if (
    last &&
    last.action === check.action &&
    last.thesisStatus === check.thesisStatus
  ) {
    return;
  }
  store[ticker] = [
    ...prev,
    {
      at,
      action: check.action,
      thesisStatus: check.thesisStatus,
      verdict: check.verdict,
    },
  ].slice(-MAX_PER_TICKER);
  saveStore(store);
}

export function loadPulseHistory(ticker: string): PulseHistoryEntry[] {
  const key = ticker.trim().toUpperCase();
  return loadStore()[key] ?? [];
}
