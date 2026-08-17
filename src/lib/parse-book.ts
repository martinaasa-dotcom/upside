import { isRecord, readFiniteNumber, readString } from "@/lib/unknown";
import { CLASS_PERIOD_KINDS, type ClassroomTrade } from "@/lib/classroom";
import type { Holding, Portfolio } from "@/lib/types";

function parseClassroomTrade(value: unknown): ClassroomTrade | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const kind = CLASS_PERIOD_KINDS.find((k) => k === value.kind);
  if (
    !kind ||
    typeof value.canBuy !== "boolean" ||
    typeof value.canSell !== "boolean" ||
    typeof value.canAdjust !== "boolean" ||
    typeof value.canCash !== "boolean" ||
    typeof value.label !== "string" ||
    typeof value.message !== "string" ||
    typeof value.studentLocked !== "boolean"
  ) {
    return undefined;
  }
  return {
    kind,
    canBuy: value.canBuy,
    canSell: value.canSell,
    canAdjust: value.canAdjust,
    canCash: value.canCash,
    purpose: typeof value.purpose === "string" ? value.purpose : null,
    until: typeof value.until === "string" ? value.until : null,
    label: value.label,
    message: value.message,
    studentLocked: value.studentLocked,
  };
}

export function parseHolding(value: unknown): Holding | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const portfolioId = readString(value.portfolio_id);
  const ticker = readString(value.ticker);
  const shares = readFiniteNumber(value.shares);
  const buyPrice = readFiniteNumber(value.buy_price);
  if (!id || !portfolioId || !ticker || shares == null || buyPrice == null) {
    return null;
  }
  const call = readFiniteNumber(value.target_call_pct) ?? 0;
  const sort = readFiniteNumber(value.sort_order) ?? 99;
  const eoy =
    value.eoy_target == null ? null : readFiniteNumber(value.eoy_target);
  const stockTarget =
    value.stock_target_override == null
      ? null
      : readFiniteNumber(value.stock_target_override);
  if (value.eoy_target != null && eoy == null) return null;
  if (value.stock_target_override != null && stockTarget == null) return null;
  return {
    id,
    portfolio_id: portfolioId,
    ticker,
    shares,
    buy_price: buyPrice,
    eoy_target: eoy ?? null,
    target_call_pct: call,
    stock_target_override: stockTarget ?? null,
    sort_order: sort,
  };
}

export function parsePortfolio(value: unknown): Portfolio | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const name = readString(value.name);
  const slug = readString(value.slug) ?? "";
  const sort = readFiniteNumber(value.sort_order) ?? 0;
  const cash = readFiniteNumber(value.cash_balance);
  if (!id || !name || cash == null) return null;
  const portfolio: Portfolio = {
    id,
    name,
    slug,
    sort_order: sort,
    cash_balance: cash,
  };
  if (typeof value.owner_id === "string" || value.owner_id === null) {
    portfolio.owner_id = value.owner_id;
  }
  if (typeof value.classroom_community_id === "string" || value.classroom_community_id === null) {
    portfolio.classroom_community_id = value.classroom_community_id;
  }
  if (Array.isArray(value.coOwnerIds)) {
    portfolio.coOwnerIds = value.coOwnerIds.filter(
      (item): item is string => typeof item === "string"
    );
  }
  const classTrade = parseClassroomTrade(value.classTrade);
  if (classTrade !== undefined) portfolio.classTrade = classTrade;
  return portfolio;
}

export function parseHoldingList(value: unknown): Holding[] {
  if (!Array.isArray(value)) return [];
  const out: Holding[] = [];
  for (const row of value) {
    const parsed = parseHolding(row);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function parsePortfolioList(value: unknown): Portfolio[] {
  if (!Array.isArray(value)) return [];
  const out: Portfolio[] = [];
  for (const row of value) {
    const parsed = parsePortfolio(row);
    if (parsed) out.push(parsed);
  }
  return out;
}
