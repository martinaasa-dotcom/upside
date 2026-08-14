/**
 * Fun, deterministic-per-day comparison facts across community members —
 * same seeded-angle architecture as lib/fun-facts.ts, just comparing
 * people instead of tickers. Purely playful; never a basis for advice.
 */

import { hashSeed, mulberry32, pick, shuffleInPlace } from "@/lib/seeded-rng";
import type { PortfolioPersonality } from "@/lib/portfolio-personality";

export type CommunityMemberStat = {
  name: string;
  totalValue: number;
  todayDollar: number;
  todayPct: number | null;
  roiPct: number;
  personality: PortfolioPersonality | null;
};

function pct1(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

function money(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

const IRREGULAR_PLURALS: Record<string, string> = { Wolf: "Wolves" };

function pluralAnimal(animal: string, n: number): string {
  if (n === 1) return animal;
  return IRREGULAR_PLURALS[animal] ?? `${animal}s`;
}

type FactCtx = {
  members: CommunityMemberStat[];
  rng: () => number;
};

type FactMaker = (ctx: FactCtx) => string | null;

const MAKERS: FactMaker[] = [
  // Today's MVP.
  ({ members, rng }) => {
    const ranked = members
      .filter((m) => m.todayPct != null)
      .sort((a, b) => (b.todayPct ?? 0) - (a.todayPct ?? 0));
    const top = ranked[0];
    if (!top || (top.todayPct ?? 0) <= 0) return null;
    return pick(rng, [
      `${top.name} is today's MVP, up ${pct1(top.todayPct!)} ($${money(top.todayDollar)}).`,
      `Today's main character: ${top.name} at +${pct1(top.todayPct!)}.`,
      `${top.name} is winning the day, +$${money(top.todayDollar)} and climbing.`,
    ]);
  },
  // Today's underdog.
  ({ members, rng }) => {
    const ranked = members
      .filter((m) => m.todayPct != null)
      .sort((a, b) => (a.todayPct ?? 0) - (b.todayPct ?? 0));
    const bottom = ranked[0];
    if (!bottom || (bottom.todayPct ?? 0) >= 0) return null;
    return pick(rng, [
      `${bottom.name} is having a rough day, ${pct1(bottom.todayPct!)}. Chin up.`,
      `Today's villain arc belongs to ${bottom.name} (${pct1(bottom.todayPct!)}).`,
      `${bottom.name} could use a pep talk today, ${pct1(bottom.todayPct!)}.`,
    ]);
  },
  // Best lifetime ROI.
  ({ members, rng }) => {
    const ranked = [...members].sort((a, b) => b.roiPct - a.roiPct);
    const top = ranked[0];
    if (!top || top.roiPct <= 0) return null;
    return pick(rng, [
      `${top.name} has the best lifetime record, up ${pct1(top.roiPct)} all-time.`,
      `Hall of fame: ${top.name} at ${pct1(top.roiPct)} lifetime ROI.`,
      `${top.name} is still ahead on lifetime: ${pct1(top.roiPct)}.`,
    ]);
  },
  // Riskiest investor.
  ({ members, rng }) => {
    const withScore = members.filter((m) => m.personality);
    const ranked = [...withScore].sort(
      (a, b) => (b.personality?.riskScore ?? 0) - (a.personality?.riskScore ?? 0)
    );
    const top = ranked[0];
    if (!top?.personality) return null;
    return pick(rng, [
      `${top.name} is the group's risk-taker: ${top.personality.riskScore}/100 risk score, ${top.personality.animalEmoji} ${top.personality.animal} energy.`,
      `Highest risk appetite: ${top.name} (${top.personality.riskScore}/100). Not for the faint of heart.`,
      `${top.name} runs the hottest book here (risk ${top.personality.riskScore}/100).`,
    ]);
  },
  // Most diversified.
  ({ members, rng }) => {
    const withScore = members.filter((m) => m.personality);
    const ranked = [...withScore].sort(
      (a, b) =>
        (b.personality?.diversificationScore ?? 0) -
        (a.personality?.diversificationScore ?? 0)
    );
    const top = ranked[0];
    if (!top?.personality) return null;
    return pick(rng, [
      `${top.name} is the most spread out, ${top.personality.diversificationScore}/100 diversification.`,
      `Least concentrated book: ${top.name} (${top.personality.diversificationScore}/100). Nothing keeping all its eggs in one basket.`,
    ]);
  },
  // Most concentrated.
  ({ members, rng }) => {
    const withScore = members.filter((m) => m.personality);
    const ranked = [...withScore].sort(
      (a, b) =>
        (a.personality?.diversificationScore ?? 100) -
        (b.personality?.diversificationScore ?? 100)
    );
    const top = ranked[0];
    if (!top?.personality || top.personality.diversificationScore >= 40) return null;
    return pick(rng, [
      `${top.name} is all-in on conviction, just ${top.personality.diversificationScore}/100 diversification.`,
      `${top.name} keeps it tight, the most concentrated book in the group.`,
    ]);
  },
  // Animal census.
  ({ members, rng }) => {
    const counts = new Map<string, { emoji: string; n: number }>();
    for (const m of members) {
      if (!m.personality) continue;
      const key = m.personality.animal;
      const prev = counts.get(key);
      counts.set(key, { emoji: m.personality.animalEmoji, n: (prev?.n ?? 0) + 1 });
    }
    if (counts.size === 0) return null;
    const parts = [...counts.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([animal, { emoji, n }]) => `${n} ${emoji} ${pluralAnimal(animal, n)}`);
    return pick(rng, [
      `Animal census: ${parts.join(", ")}.`,
      `The circle's animals: ${parts.join(", ")}.`,
    ]);
  },
  // Combined family movement today.
  ({ members, rng }) => {
    const total = members.reduce((s, m) => s + m.todayDollar, 0);
    if (total === 0) return null;
    return pick(rng, [
      // The sign has to survive: this used to print "+" for gains and
      // nothing at all for losses, so a red day read as a plain positive
      // dollar figure sitting next to "Rough one."
      `Combined movement today: ${total >= 0 ? "+" : "-"}$${money(Math.abs(total))}. ${total >= 0 ? "Nice." : "Rough one."}`,
      `Add up every book's day and the circle is ${total >= 0 ? "up" : "down"} $${money(Math.abs(total))} today.`,
    ]);
  },
  // Value gap between biggest and smallest book.
  ({ members, rng }) => {
    if (members.length < 2) return null;
    const sorted = [...members].sort((a, b) => b.totalValue - a.totalValue);
    const biggest = sorted[0]!;
    const smallest = sorted[sorted.length - 1]!;
    if (biggest.name === smallest.name) return null;
    const gap = biggest.totalValue - smallest.totalValue;
    if (gap <= 0) return null;
    return pick(rng, [
      `${biggest.name}'s book is $${money(gap)} ahead of ${smallest.name}'s. Gap season.`,
      `Biggest-to-smallest spread in the group: $${money(gap)} (${biggest.name} vs ${smallest.name}).`,
    ]);
  },
  // Combined family NAV.
  ({ members, rng }) => {
    const total = members.reduce((s, m) => s + m.totalValue, 0);
    if (total <= 0) return null;
    return pick(rng, [
      `The circle is sitting on $${money(total)} combined. Not a small group project.`,
      `Circle NAV: $${money(total)} across ${members.length} book${members.length === 1 ? "" : "s"}.`,
    ]);
  },
  // Falcon/small-book flex.
  ({ members, rng }) => {
    const falcons = members.filter((m) => m.personality?.animal === "Falcon");
    if (falcons.length === 0) return null;
    const f = pick(rng, falcons);
    return pick(rng, [
      `${f.name} is a Falcon: small book, sharp aim, ${pct1(f.roiPct)} lifetime.`,
      `Don't underestimate ${f.name}'s Falcon book, few positions, high conviction.`,
    ]);
  },
];

/**
 * Up to `limit` distinct facts for the given day — deterministic per
 * dayKey so a refresh doesn't shuffle the list, but a new day (or manual
 * shuffle seed) gets a fresh batch.
 */
export function buildCommunityFunFacts(
  members: CommunityMemberStat[],
  dayKey: string,
  limit = 6
): string[] {
  if (members.length === 0) return [];
  const seed = hashSeed(`upside-community-fun|${dayKey}|${members.length}`);
  const rng = mulberry32(seed);
  const ctx: FactCtx = { members, rng };

  const order = shuffleInPlace(rng, MAKERS.map((_, i) => i));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const idx of order) {
    if (out.length >= limit) break;
    const candidate = MAKERS[idx]!(ctx);
    if (!candidate) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}
