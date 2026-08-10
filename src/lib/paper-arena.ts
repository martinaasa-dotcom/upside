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

function stamp(state: ArenaState): ArenaState {
  return { ...state, updatedAt: new Date().toISOString() };
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
    localStorage.setItem(KEY, JSON.stringify(stamp(state)));
  } catch {
    /* ignore */
  }
}

export function seedArenaFromLive(
  cash: number,
  holdings: Holding[],
  sheetName?: string
): ArenaState {
  const state = stamp({
    cash,
    holdings: holdings.map((h) => ({
      ticker: h.ticker,
      shares: h.shares,
      buyPrice: h.buy_price,
    })),
    note: sheetName
      ? `Cloned from ${sheetName} — edits stay in Arena.`
      : "Cloned from live sheet — edits stay in Arena.",
    updatedAt: new Date().toISOString(),
  });
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

export function setArenaCash(state: ArenaState, cash: number): ArenaState {
  return stamp({ ...state, cash });
}

/** Buy shares in the sandbox (spends cash). Returns null if not enough cash. */
export function arenaBuy(
  state: ArenaState,
  ticker: string,
  shares: number,
  price: number
): ArenaState | null {
  const t = ticker.trim().toUpperCase();
  if (!t || !(shares > 0) || !(price > 0)) return null;
  const cost = shares * price;
  if (cost > state.cash + 1e-9) return null;
  const existing = state.holdings.find((h) => h.ticker === t);
  let holdings: ArenaHolding[];
  if (existing) {
    const nextShares = existing.shares + shares;
    const nextCost = existing.shares * existing.buyPrice + cost;
    holdings = state.holdings.map((h) =>
      h.ticker === t
        ? { ticker: t, shares: nextShares, buyPrice: nextCost / nextShares }
        : h
    );
  } else {
    holdings = [...state.holdings, { ticker: t, shares, buyPrice: price }];
  }
  return stamp({ ...state, cash: state.cash - cost, holdings });
}

/** Sell shares in the sandbox (adds cash). Returns null if not enough shares. */
export function arenaSell(
  state: ArenaState,
  ticker: string,
  shares: number,
  price: number
): ArenaState | null {
  const t = ticker.trim().toUpperCase();
  if (!t || !(shares > 0) || !(price > 0)) return null;
  const existing = state.holdings.find((h) => h.ticker === t);
  if (!existing || existing.shares < shares - 1e-9) return null;
  const proceeds = shares * price;
  const left = existing.shares - shares;
  const holdings =
    left < 1e-9
      ? state.holdings.filter((h) => h.ticker !== t)
      : state.holdings.map((h) =>
          h.ticker === t ? { ...h, shares: left } : h
        );
  return stamp({ ...state, cash: state.cash + proceeds, holdings });
}
