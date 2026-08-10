import type { ConvictionMap } from "@/lib/conviction";
import type { CashflowEntry } from "@/lib/cashflow";
import type { ArenaState } from "@/lib/paper-arena";
import { defaultArena } from "@/lib/paper-arena";
import type { JournalEntry } from "@/lib/trade-journal";

export type LabBadge = {
  id: string;
  label: string;
  earnedAt: string;
};

export type LabBundle = {
  conviction: ConvictionMap;
  journal: JournalEntry[];
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

/** Derive simple season badges from book stats (client or server). */
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
  if (input.greenStreakMax >= 5) earn("streak-5", "5-day green run");
  if (input.greenStreakMax >= 10) earn("streak-10", "10-day heat");
  if (input.roiPct >= 0.25) earn("roi-25", "Book +25% lifetime");
  if (input.roiPct >= 0.5) earn("roi-50", "Book +50% lifetime");
  if (input.holdingCount >= 8) earn("diversified-8", "8+ names held");
  return [...byId.values()].sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
}
