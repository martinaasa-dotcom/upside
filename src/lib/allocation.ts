import { TICKER_SECTORS } from "@/lib/forecast-plan";

export type AllocationSlice = {
  key: string;
  label: string;
  value: number;
  pct: number;
};

export function allocationBySector(
  holdings: Array<{ ticker: string; currentValue: number }>
): AllocationSlice[] {
  const totals = new Map<string, number>();
  let sum = 0;
  for (const h of holdings) {
    const base = h.ticker.split(".")[0]!.toUpperCase();
    const sector =
      TICKER_SECTORS[h.ticker] ?? TICKER_SECTORS[base] ?? "Unclassified";
    totals.set(sector, (totals.get(sector) ?? 0) + h.currentValue);
    sum += h.currentValue;
  }
  if (sum <= 0) return [];
  return [...totals.entries()]
    .map(([label, value]) => ({
      key: label,
      label,
      value,
      pct: value / sum,
    }))
    .sort((a, b) => b.value - a.value);
}

export function allocationByTicker(
  holdings: Array<{ ticker: string; currentValue: number }>,
  topN = 8
): AllocationSlice[] {
  const sum = holdings.reduce((s, h) => s + h.currentValue, 0);
  if (sum <= 0) return [];
  const sorted = [...holdings].sort((a, b) => b.currentValue - a.currentValue);
  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN).reduce((s, h) => s + h.currentValue, 0);
  const slices = top.map((h) => ({
    key: h.ticker,
    label: h.ticker,
    value: h.currentValue,
    pct: h.currentValue / sum,
  }));
  if (rest > 0) {
    slices.push({ key: "other", label: "Other", value: rest, pct: rest / sum });
  }
  return slices;
}
