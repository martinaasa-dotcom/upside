import type { OverviewModel } from "@/lib/overview";
import { todayKeyInTz } from "@/lib/timezone";

const KEY = "upside-last-visit-v1";

export type VisitSnapshot = {
  at: string;
  dayKey: string;
  totalValue: number;
  equityValue: number;
  cash: number;
  todayDollar: number;
  roiPct: number;
  byTicker: Record<
    string,
    { price: number; value: number; roiPct: number; todayPct: number | null }
  >;
  bySheet: Record<
    string,
    { name: string; value: number; roiPct: number; todayDollar: number }
  >;
};

export type VisitDiffLine = {
  id: string;
  text: string;
  tone: "up" | "down" | "neutral";
};

export type VisitDiff = {
  previousAt: string;
  lines: VisitDiffLine[];
};

function money(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${Math.round(n).toLocaleString("en-US")}`;
}

function pct1(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${Math.round(n * 1000) / 10}%`;
}

export function captureVisitSnapshot(model: OverviewModel): VisitSnapshot {
  const byTicker: VisitSnapshot["byTicker"] = {};
  for (const t of model.tickers) {
    byTicker[t.ticker] = {
      price: t.price,
      value: t.currentValue,
      roiPct: t.roiPct,
      todayPct: t.todayPct,
    };
  }
  const bySheet: VisitSnapshot["bySheet"] = {};
  for (const s of model.sheets) {
    bySheet[s.portfolio.id] = {
      name: s.portfolio.name,
      value: s.totalValue,
      roiPct: s.roiPct,
      todayDollar: s.todayDollar,
    };
  }
  return {
    at: new Date().toISOString(),
    dayKey: todayKeyInTz(),
    totalValue: model.totals.totalValue,
    equityValue: model.totals.equityValue,
    cash: model.totals.cash,
    todayDollar: model.totals.todayDollar,
    roiPct: model.totals.roiPct,
    byTicker,
    bySheet,
  };
}

export function loadVisitSnapshot(): VisitSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VisitSnapshot;
  } catch {
    return null;
  }
}

export function saveVisitSnapshot(snap: VisitSnapshot) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

export function diffSinceLastVisit(
  prev: VisitSnapshot,
  model: OverviewModel
): VisitDiff {
  const lines: VisitDiffLine[] = [];
  const navDelta = model.totals.totalValue - prev.totalValue;
  if (Math.abs(navDelta) >= 50) {
    lines.push({
      id: "nav",
      text: `Combined NAV ${money(navDelta)} since last open`,
      tone: navDelta >= 0 ? "up" : "down",
    });
  }

  const cashDelta = model.totals.cash - prev.cash;
  if (Math.abs(cashDelta) >= 100) {
    lines.push({
      id: "cash",
      text: `Cash moved ${money(cashDelta)}`,
      tone: cashDelta >= 0 ? "up" : "down",
    });
  }

  type Move = { ticker: string; deltaPct: number; deltaValue: number };
  const moves: Move[] = [];
  for (const t of model.tickers) {
    const p = prev.byTicker[t.ticker];
    if (!p || !(p.price > 0)) continue;
    const deltaPct = (t.price - p.price) / p.price;
    const deltaValue = t.currentValue - p.value;
    if (Math.abs(deltaPct) >= 0.015 || Math.abs(deltaValue) >= 250) {
      moves.push({ ticker: t.ticker, deltaPct, deltaValue });
    }
  }
  moves.sort((a, b) => Math.abs(b.deltaValue) - Math.abs(a.deltaValue));
  for (const m of moves.slice(0, 4)) {
    lines.push({
      id: `t-${m.ticker}`,
      text: `${m.ticker} ${pct1(m.deltaPct)} (${money(m.deltaValue)})`,
      tone: m.deltaPct >= 0 ? "up" : "down",
    });
  }

  // New / gone tickers
  const prevSet = new Set(Object.keys(prev.byTicker));
  const nowSet = new Set(model.tickers.map((t) => t.ticker));
  for (const t of nowSet) {
    if (!prevSet.has(t)) {
      lines.push({
        id: `new-${t}`,
        text: `${t} showed up since last open`,
        tone: "neutral",
      });
    }
  }
  for (const t of prevSet) {
    if (!nowSet.has(t)) {
      lines.push({
        id: `gone-${t}`,
        text: `${t} left the book since last open`,
        tone: "neutral",
      });
    }
  }

  const sheetDeltas = model.sheets
    .map((s) => {
      const p = prev.bySheet[s.portfolio.id];
      if (!p) return null;
      return {
        name: s.portfolio.name,
        delta: s.totalValue - p.value,
      };
    })
    .filter(Boolean) as { name: string; delta: number }[];
  sheetDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const lead = sheetDeltas[0];
  if (lead && Math.abs(lead.delta) >= 200) {
    lines.push({
      id: `sheet-${lead.name}`,
      text: `${lead.name} led sheet moves (${money(lead.delta)})`,
      tone: lead.delta >= 0 ? "up" : "down",
    });
  }

  if (lines.length === 0) {
    lines.push({
      id: "quiet",
      text: "Quiet since last open — book barely flinched",
      tone: "neutral",
    });
  }

  return { previousAt: prev.at, lines: lines.slice(0, 8) };
}
