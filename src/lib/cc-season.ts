import type { CashflowEntry } from "@/lib/cashflow";
import type { CoveredCallRow } from "@/lib/types";
import { todayKeyInTz } from "@/lib/timezone";

export type CcSeason = {
  monthKey: string;
  label: string;
  /** Premiums logged this calendar month */
  bookedPremium: number;
  /** Modeled open premium from CC rows */
  openPremium: number;
  /** Soft monthly target (1% of equity, floor 500) */
  target: number;
  progress: number;
  contractsOpen: number;
  nextExpiry: string | null;
  premiumByExpiry: Array<{ expiry: string; premium: number; contracts: number }>;
};

function monthKeyTallinn(): string {
  return todayKeyInTz().slice(0, 7); // YYYY-MM
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function buildCcSeason(input: {
  cashflows: CashflowEntry[];
  coveredCallRows: CoveredCallRow[];
  equityValue: number;
}): CcSeason {
  const mk = monthKeyTallinn();
  const bookedPremium = input.cashflows
    .filter(
      (e) =>
        e.kind === "premium" &&
        typeof e.at === "string" &&
        e.at.slice(0, 7) === mk
    )
    .reduce((s, e) => s + e.amount, 0);

  const openPremium = input.coveredCallRows.reduce(
    (s, r) => s + (r.premium ?? 0),
    0
  );
  const contractsOpen = input.coveredCallRows.reduce(
    (s, r) => s + (r.contracts > 0 ? r.contracts : 0),
    0
  );

  const byExp = new Map<string, { premium: number; contracts: number }>();
  for (const r of input.coveredCallRows) {
    const exp = r.expiration ?? "—";
    const prev = byExp.get(exp) ?? { premium: 0, contracts: 0 };
    prev.premium += r.premium ?? 0;
    prev.contracts += r.contracts > 0 ? r.contracts : 0;
    byExp.set(exp, prev);
  }
  const premiumByExpiry = [...byExp.entries()]
    .map(([expiry, v]) => ({ expiry, ...v }))
    .sort((a, b) => a.expiry.localeCompare(b.expiry));

  const nextExpiry =
    premiumByExpiry.find((e) => e.expiry !== "—")?.expiry ?? null;

  const target = Math.max(500, Math.round(input.equityValue * 0.01));
  const scored = bookedPremium + openPremium * 0.35;
  const progress = target > 0 ? Math.min(1.5, scored / target) : 0;

  return {
    monthKey: mk,
    label: monthLabel(mk),
    bookedPremium,
    openPremium,
    target,
    progress,
    contractsOpen,
    nextExpiry,
    premiumByExpiry,
  };
}
