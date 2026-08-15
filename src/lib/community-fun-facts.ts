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

const IRREGULAR_PLURALS: Record<string, string> = {
  Wolf: "Wolves",
  Fox: "Foxes",
  Octopus: "Octopuses",
};

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
  // Biggest book (live mark, not cost).
  ({ members, rng }) => {
    const ranked = [...members].sort((a, b) => b.totalValue - a.totalValue);
    const top = ranked[0];
    if (!top || top.totalValue <= 0) return null;
    return pick(rng, [
      `${top.name} is carrying the biggest book, $${money(top.totalValue)}.`,
      `Largest live mark: ${top.name} at $${money(top.totalValue)}.`,
      `${top.name} has the most on the board right now, $${money(top.totalValue)}.`,
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
      `${top.name} is all-in on a few names, just ${top.personality.diversificationScore}/100 spread.`,
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
      `${f.name} is a Falcon: small book, sharp aim.`,
      `Don't underestimate ${f.name}'s Falcon book, few positions, big bets.`,
    ]);
  },
  // Octopus: most habitats.
  ({ members, rng }) => {
    const octopi = members.filter((m) => m.personality?.animal === "Octopus");
    if (octopi.length === 0) return null;
    const o = pick(rng, octopi);
    return pick(rng, [
      `${o.name} is an Octopus: ${o.personality!.themeCount} live themes, a tentacle in every pond.`,
      `Most habitats in the circle: ${o.name} the Octopus (${o.personality!.themeCount} themes).`,
    ]);
  },
  // Squirrel cash stash.
  ({ members, rng }) => {
    const withCash = members.filter(
      (m) => m.personality && m.personality.cashPct >= 8
    );
    if (withCash.length === 0) return null;
    const top = [...withCash].sort(
      (a, b) => (b.personality?.cashPct ?? 0) - (a.personality?.cashPct ?? 0)
    )[0]!;
    return pick(rng, [
      `${top.name} is sitting on ${top.personality!.cashPct}% cash. Squirrel energy, whether the badge says so or not.`,
      `Biggest dry-powder stash: ${top.name} at ${top.personality!.cashPct}% cash.`,
    ]);
  },
  // Highest conviction name.
  ({ members, rng }) => {
    const withTop = members.filter(
      (m) => m.personality && m.personality.convictionScore >= 30
    );
    if (withTop.length === 0) return null;
    const top = [...withTop].sort(
      (a, b) =>
        (b.personality?.convictionScore ?? 0) -
        (a.personality?.convictionScore ?? 0)
    )[0]!;
    const name = top.personality!.topTicker ?? "one name";
    return pick(rng, [
      `${top.name}'s largest position is ${top.personality!.convictionScore}% (${name}). That's a big bet.`,
      `Biggest single bet in the circle: ${top.name}, ${top.personality!.convictionScore}% in ${name}.`,
    ]);
  },
  // Panda specialist.
  ({ members, rng }) => {
    const pandas = members.filter((m) => m.personality?.animal === "Panda");
    if (pandas.length === 0) return null;
    const p = pick(rng, pandas);
    return pick(rng, [
      `${p.name} is a Panda: ${p.personality!.specialistScore}% in one theme. When that bamboo moves, the whole book moves.`,
      `One-theme diet: ${p.name} the Panda, ${p.personality!.specialistScore}% specialist.`,
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
