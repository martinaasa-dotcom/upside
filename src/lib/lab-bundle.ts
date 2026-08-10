import type { ConvictionMap } from "@/lib/conviction";
import type { CashflowEntry } from "@/lib/cashflow";
import type { ArenaState } from "@/lib/paper-arena";
import { defaultArena } from "@/lib/paper-arena";

export type LabBadge = {
  id: string;
  label: string;
  earnedAt: string;
};

export type LabBundle = {
  conviction: ConvictionMap;
  /** @deprecated Journal removed — kept empty for API/DB shape. */
  journal: [];
  cashflows: CashflowEntry[];
  arena: ArenaState;
  badges: LabBadge[];
  updatedAt?: string;
};

export function emptyLabBundle(): LabBundle {
  return {
    conviction: {},
    journal: [],
    cashflows: [],
    arena: defaultArena(),
    badges: [],
  };
}

/** Milestone badges from book stats — no streaks / XP. */
export function deriveBadges(input: {
  greenStreakMax: number;
  roiPct: number;
  holdingCount: number;
  existing: LabBadge[];
}): LabBadge[] {
  const byId = new Map(input.existing.map((b) => [b.id, b]));
  const now = new Date().toISOString();
  function earn(id: string, label: string) {
    if (!byId.has(id)) byId.set(id, { id, label, earnedAt: now });
  }
  // Drop legacy streak badges if present
  byId.delete("streak-5");
  byId.delete("streak-10");
  if (input.roiPct >= 0.25) earn("roi-25", "Book +25% lifetime");
  if (input.roiPct >= 0.5) earn("roi-50", "Book +50% lifetime");
  if (input.holdingCount >= 8) earn("diversified-8", "8+ names held");
  return [...byId.values()].sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
}
