/** Paper Arena — sandbox book that never touches live sheets. */

import type { Holding } from "@/lib/types";

export type ArenaHolding = {
  ticker: string;
  shares: number;
  buyPrice: number;
};

export type ArenaState = {
  cash: number;
  holdings: ArenaHolding[];
  note: string;
  updatedAt: string;
};

const KEY = "upside-paper-arena-v1";

export function defaultArena(): ArenaState {
  return {
    cash: 10_000,
    holdings: [],
    note: "Sandbox — not the live book.",
    updatedAt: new Date().toISOString(),
  };
}

export function loadArena(): ArenaState {
  if (typeof window === "undefined") return defaultArena();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultArena();
    return { ...defaultArena(), ...(JSON.parse(raw) as ArenaState) };
  } catch {
    return defaultArena();
  }
}

export function saveArena(state: ArenaState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...state, updatedAt: new Date().toISOString() })
    );
  } catch {
    /* ignore */
  }
}

export function seedArenaFromLive(
  cash: number,
  holdings: Holding[]
): ArenaState {
  const state: ArenaState = {
    cash,
    holdings: holdings.map((h) => ({
      ticker: h.ticker,
      shares: h.shares,
      buyPrice: h.buy_price,
    })),
    note: "Cloned from live sheet — edits stay in Arena.",
    updatedAt: new Date().toISOString(),
  };
  saveArena(state);
  return state;
}

export function arenaValue(
  state: ArenaState,
  prices: Record<string, number>
): number {
  const eq = state.holdings.reduce(
    (s, h) => s + h.shares * (prices[h.ticker] ?? h.buyPrice),
    0
  );
  return eq + state.cash;
}
