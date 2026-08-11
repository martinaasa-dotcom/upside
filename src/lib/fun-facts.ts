import { todayKeyInTz } from "@/lib/timezone";
import type { OverviewModel, SheetScore, TickerScore } from "@/lib/overview";
import { hashSeed, mulberry32, pick, shuffleInPlace } from "@/lib/seeded-rng";

type FactCtx = {
  sheets: SheetScore[];
  tickers: TickerScore[];
  totals: OverviewModel["totals"];
  dayKey: string;
  rng: () => number;
};

type FactMaker = (ctx: FactCtx) => string | null;

function pct1(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

function money(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function byRoiDesc(a: TickerScore, b: TickerScore) {
  return b.roiPct - a.roiPct;
}
function byRoiAsc(a: TickerScore, b: TickerScore) {
  return a.roiPct - b.roiPct;
}
function byValueDesc(a: TickerScore, b: TickerScore) {
  return b.currentValue - a.currentValue;
}
function byTodayDesc(a: TickerScore, b: TickerScore) {
  return (b.todayPct ?? -Infinity) - (a.todayPct ?? -Infinity);
}
function byTodayAsc(a: TickerScore, b: TickerScore) {
  return (a.todayPct ?? Infinity) - (b.todayPct ?? Infinity);
}

const MAKERS: FactMaker[] = [
  ({ sheets, totals, rng }) => {
    const biggest = [...sheets].sort((a, b) => b.totalValue - a.totalValue)[0];
    if (!biggest || totals.totalValue <= 0) return null;
    const share = Math.round((biggest.totalValue / totals.totalValue) * 100);
    return pick(rng, [
      `${biggest.portfolio.name} is the heavyweight book — ${share}% of combined NAV.`,
      `${biggest.portfolio.name} is carrying ${share}% of the family fortune. No pressure.`,
      `If the books were a group chat, ${biggest.portfolio.name} would be the admin (${share}% of NAV).`,
      `${biggest.portfolio.name} ate ${share}% of the pie. The others are sharing crumbs politely.`,
    ]);
  },

  ({ sheets, rng }) => {
    const smallest = [...sheets].sort((a, b) => a.totalValue - b.totalValue)[0];
    if (!smallest) return null;
    return pick(rng, [
      `${smallest.portfolio.name} is the scrappy underdog book at $${money(smallest.totalValue)}.`,
      `Tiny but mighty? ${smallest.portfolio.name} clocks in at $${money(smallest.totalValue)}.`,
      `${smallest.portfolio.name} is running the guerrilla campaign — only $${money(smallest.totalValue)} on the board.`,
    ]);
  },

  ({ tickers, rng }) => {
    const hot = [...tickers].sort(byRoiDesc)[0];
    if (!hot || hot.roiPct <= 0) return null;
    const where =
      hot.portfolios.length > 1
        ? `across ${hot.portfolios.join(" · ")}`
        : `in ${hot.portfolios[0]}`;
    return pick(rng, [
      `${hot.ticker} is the lifetime MVP at ${pct1(hot.roiPct)} ROI ${where}.`,
      `Hall of fame: ${hot.ticker} printed ${pct1(hot.roiPct)} ROI ${where}.`,
      `${hot.ticker} has been eating well — ${pct1(hot.roiPct)} lifetime ROI ${where}.`,
      `Somebody high-fived ${hot.ticker}: ${pct1(hot.roiPct)} ROI ${where}.`,
    ]);
  },

  ({ tickers, rng }) => {
    const cold = [...tickers].sort(byRoiAsc)[0];
    if (!cold || cold.roiPct >= 0) return null;
    return pick(rng, [
      `${cold.ticker} is the drama queen at ${pct1(cold.roiPct)} — owned by ${cold.portfolios.join(", ")}.`,
      `${cold.ticker} is on a villain arc (${pct1(cold.roiPct)}) in ${cold.portfolios.join(", ")}.`,
      `Character development pending: ${cold.ticker} sits at ${pct1(cold.roiPct)}.`,
      `${cold.ticker} whispered “I’m just resting” at ${pct1(cold.roiPct)}.`,
    ]);
  },

  ({ tickers, rng }) => {
    const most = [...tickers].sort(
      (a, b) =>
        b.portfolios.length - a.portfolios.length ||
        b.currentValue - a.currentValue
    )[0];
    if (!most || most.portfolios.length < 2) return null;
    return pick(rng, [
      `${most.ticker} is the house favorite — in ${most.portfolios.length} books (${most.portfolios.join(", ")}).`,
      `Conspiracy board: ${most.ticker} shows up in ${most.portfolios.length} portfolios.`,
      `Family reunion guest of honor: ${most.ticker} (${most.portfolios.join(", ")}).`,
      `${most.ticker} has more group chats than you — ${most.portfolios.length} books deep.`,
    ]);
  },

  ({ tickers, rng }) => {
    const solo = tickers.filter((t) => t.portfolios.length === 1);
    if (!solo.length) return null;
    const t = pick(rng, solo);
    return pick(rng, [
      `${t.ticker} is a solo act — only ${t.portfolios[0]} dared.`,
      `Exclusive drop: ${t.ticker} lives only in ${t.portfolios[0]}.`,
      `${t.portfolios[0]} has a private ${t.ticker} stash. No sharing.`,
    ]);
  },

  ({ tickers, rng }) => {
    const day = [...tickers].filter((t) => t.todayPct != null).sort(byTodayDesc)[0];
    if (!day || (day.todayPct ?? 0) <= 0) return null;
    return pick(rng, [
      `Today's main character: ${day.ticker} at ${pct1(day.todayPct!)} — $${money(day.todayDollar)} of smile.`,
      `${day.ticker} stole the scene today (+${pct1(day.todayPct!)}, $${money(day.todayDollar)}).`,
      `Green confetti for ${day.ticker}: ${pct1(day.todayPct!)} / $${money(day.todayDollar)}.`,
      `Plot twist (bullish): ${day.ticker} ripped ${pct1(day.todayPct!)} today.`,
    ]);
  },

  ({ tickers, rng }) => {
    const day = [...tickers].filter((t) => t.todayPct != null).sort(byTodayAsc)[0];
    if (!day || (day.todayPct ?? 0) >= 0) return null;
    return pick(rng, [
      `Today's villain: ${day.ticker} at ${pct1(day.todayPct!)} ($${money(day.todayDollar)}).`,
      `${day.ticker} brought the rain: ${pct1(day.todayPct!)} on the day.`,
      `Somebody unplugged ${day.ticker}: ${pct1(day.todayPct!)} today.`,
    ]);
  },

  ({ totals, rng }) => {
    if (totals.cash === 0) return null;
    if (totals.cash < 0) {
      return pick(rng, [
        `Combined cash is $${money(totals.cash)} — someone is surfing on margin.`,
        `The family is $${money(Math.abs(totals.cash))} into the broker’s cookie jar.`,
        `Negative cash alert: $${money(totals.cash)}. Bold. Chaotic. On brand.`,
      ]);
    }
    const croissants = Math.max(1, Math.round(totals.cash / 3.2));
    const coffees = Math.max(1, Math.round(totals.cash / 4.5));
    return pick(rng, [
      `There's $${money(totals.cash)} in dry powder across the family of books.`,
      `Cash pile: $${money(totals.cash)} — enough for ~${croissants.toLocaleString("en-US")} Tallinn croissants (theoretically).`,
      `$${money(totals.cash)} idle cash ≈ ${coffees.toLocaleString("en-US")} fancy coffees. Deploy wisely.`,
      `Dry powder report: $${money(totals.cash)} waiting for a spicy dip.`,
    ]);
  },

  ({ tickers, totals, rng }) => {
    const top = [...tickers].sort(byValueDesc)[0];
    if (!top || totals.equityValue <= 0) return null;
    const share = Math.round((top.currentValue / totals.equityValue) * 100);
    return pick(rng, [
      `${top.ticker} alone is ${share}% of all equity — concentration is a feature (probably).`,
      `One ticker to rule them: ${top.ticker} is ${share}% of equity.`,
      `${top.ticker} hogged ${share}% of the equity buffet.`,
    ]);
  },

  ({ tickers, totals, rng }) => {
    const top3 = [...tickers].sort(byValueDesc).slice(0, 3);
    if (top3.length < 3 || totals.equityValue <= 0) return null;
    const share = Math.round(
      (top3.reduce((s, t) => s + t.currentValue, 0) / totals.equityValue) * 100
    );
    return pick(rng, [
      `Top 3 names (${top3.map((t) => t.ticker).join(", ")}) are ${share}% of equity.`,
      `The podium — ${top3.map((t) => t.ticker).join(" / ")} — owns ${share}% of the stack.`,
      `${share}% of equity lives in just three tickers. Minimalism, but make it finance.`,
    ]);
  },

  ({ sheets, rng }) => {
    const busy = [...sheets].sort((a, b) => b.holdingCount - a.holdingCount)[0];
    if (!busy) return null;
    return pick(rng, [
      `${busy.portfolio.name} has the fullest toy box: ${busy.holdingCount} holdings.`,
      `Most positions: ${busy.portfolio.name} with ${busy.holdingCount} line items.`,
      `${busy.portfolio.name} collected ${busy.holdingCount} stamps in the ticker passport.`,
    ]);
  },

  ({ sheets, rng }) => {
    const lean = [...sheets].sort((a, b) => a.holdingCount - b.holdingCount)[0];
    if (!lean) return null;
    return pick(rng, [
      `${lean.portfolio.name} keeps it tight — only ${lean.holdingCount} holdings.`,
      `Minimalist award: ${lean.portfolio.name} (${lean.holdingCount} positions).`,
      `${lean.portfolio.name} said “fewer, better” — ${lean.holdingCount} holdings.`,
    ]);
  },

  ({ sheets, rng }) => {
    const best = [...sheets].sort((a, b) => b.roiPct - a.roiPct)[0];
    if (!best) return null;
    return pick(rng, [
      `Best book ROI: ${best.portfolio.name} at ${pct1(best.roiPct)}.`,
      `${best.portfolio.name} is winning the homework contest (${pct1(best.roiPct)} ROI).`,
      `Report card A: ${best.portfolio.name} · ${pct1(best.roiPct)}.`,
    ]);
  },

  ({ sheets, rng }) => {
    const day = [...sheets]
      .filter((s) => s.todayPct != null)
      .sort((a, b) => (b.todayPct ?? 0) - (a.todayPct ?? 0))[0];
    if (!day || (day.todayPct ?? 0) === 0) return null;
    return pick(rng, [
      `${day.portfolio.name} is today's sheet MVP (${pct1(day.todayPct!)}, $${money(day.todayDollar)}).`,
      `Intraday crown: ${day.portfolio.name} at ${pct1(day.todayPct!)}.`,
      `${day.portfolio.name} moved $${money(day.todayDollar)} today — main-character energy.`,
    ]);
  },

  ({ tickers, rng }) => {
    const hot = [...tickers].sort(byRoiDesc);
    const silver = hot[1];
    if (!silver || silver.roiPct <= 0) return null;
    return pick(rng, [
      `Silver medal ROI: ${silver.ticker} at ${pct1(silver.roiPct)} (still elite).`,
      `Not first, not last: ${silver.ticker} quietly printed ${pct1(silver.roiPct)}.`,
      `Runner-up flex: ${silver.ticker} · ${pct1(silver.roiPct)} ROI.`,
    ]);
  },

  ({ tickers, rng }) => {
    const flat = [...tickers]
      .map((t) => ({ t, abs: Math.abs(t.roiPct) }))
      .sort((a, b) => a.abs - b.abs)[0];
    if (!flat) return null;
    return pick(rng, [
      `${flat.t.ticker} is the most “meh” at ${pct1(flat.t.roiPct)} ROI — zen mode.`,
      `Boring-on-purpose award: ${flat.t.ticker} (${pct1(flat.t.roiPct)}).`,
      `${flat.t.ticker} refused the plot: ROI ≈ ${pct1(flat.t.roiPct)}.`,
    ]);
  },

  ({ tickers, rng }) => {
    const fat = [...tickers].sort((a, b) => b.shares - a.shares)[0];
    if (!fat || fat.shares < 1) return null;
    return pick(rng, [
      `Share hoarder: ${fat.shares.toLocaleString("en-US")} shares of ${fat.ticker} across the books.`,
      `If shares were stickers, ${fat.ticker} would cover the fridge (${fat.shares.toLocaleString("en-US")} of them).`,
      `${fat.ticker} share count: ${fat.shares.toLocaleString("en-US")}. That's a lot of opinions.`,
    ]);
  },

  ({ tickers, rng }) => {
    const green = tickers.filter((t) => (t.todayPct ?? 0) > 0).length;
    const red = tickers.filter((t) => (t.todayPct ?? 0) < 0).length;
    if (green + red === 0) return null;
    return pick(rng, [
      `Scoreboard today: ${green} green · ${red} red across unique tickers.`,
      `Mood ring: ${green} tickers smiling, ${red} frowning.`,
      `Intraday census — greens ${green}, reds ${red}. Democracy is messy.`,
    ]);
  },

  ({ tickers, rng }) => {
    const spread =
      ([...tickers].sort(byRoiDesc)[0]?.roiPct ?? 0) -
      ([...tickers].sort(byRoiAsc)[0]?.roiPct ?? 0);
    if (spread <= 0) return null;
    return pick(rng, [
      `ROI gap between best and worst ticker: ${pct1(spread)}. Whiplash included.`,
      `Best-vs-worst ROI spread is ${pct1(spread)} — one book, many vibes.`,
      `The emotional range of this book is ${pct1(spread)} of ROI. Method acting.`,
    ]);
  },

  ({ totals, rng }) => {
    if (totals.totalValue <= 0) return null;
    const cashShare = totals.cash / totals.totalValue;
    return pick(rng, [
      `Cash is ${pct1(cashShare)} of combined NAV — ${cashShare < 0 ? "levered chaos" : cashShare < 0.05 ? "fully invested energy" : "some dry powder left"}.`,
      `NAV vibe check: $${money(totals.totalValue)} total · cash share ${pct1(cashShare)}.`,
      `Family NAV: $${money(totals.totalValue)}. Not a small group project.`,
    ]);
  },

  ({ totals, rng }) => {
    const perSheet =
      totals.sheetCount > 0 ? totals.totalValue / totals.sheetCount : 0;
    if (perSheet <= 0) return null;
    return pick(rng, [
      `Average book size: ~$${money(perSheet)} across ${totals.sheetCount} sheets.`,
      `If you split the pie evenly: ~$${money(perSheet)} per book (you won’t).`,
      `${totals.sheetCount} books · ~$${money(perSheet)} average — inequality is the spice.`,
    ]);
  },

  ({ tickers, rng }) => {
    const names = [...tickers].map((t) => t.ticker).sort((a, b) => a.length - b.length);
    if (!names.length) return null;
    const short = names[0]!;
    const long = names[names.length - 1]!;
    if (short === long) {
      return pick(rng, [
        `Typography corner: every ticker is exactly ${short.length} letters. Cursed.`,
        `All tickers are ${short.length} chars. Design system achieved.`,
      ]);
    }
    return pick(rng, [
      `Shortest ticker: ${short}. Longest: ${long}. Branding department notes taken.`,
      `${long} wins Scrabble; ${short} wins telegram bills.`,
      `Alphabet soup length check — ${short} vs ${long}.`,
    ]);
  },

  ({ tickers, rng }) => {
    const alpha = [...tickers].map((t) => t.ticker).sort();
    if (alpha.length < 2) return null;
    return pick(rng, [
      `Dictionary order: ${alpha[0]} leads the parade; ${alpha[alpha.length - 1]} closes it.`,
      `A–Z roll call starts with ${alpha[0]} and ends on ${alpha[alpha.length - 1]}.`,
      `If tickers lined up for recess: ${alpha[0]} first, ${alpha[alpha.length - 1]} last.`,
    ]);
  },

  ({ tickers, rng }) => {
    const multi = tickers.filter((t) => t.portfolios.length >= 2);
    if (!multi.length) {
      return pick(rng, [
        "Zero overlapping tickers — every book is on its own island.",
        "No shared names across portfolios. Parallel universes mode.",
      ]);
    }
    return pick(rng, [
      `${multi.length} tickers are shared across 2+ books — family consensus (or copy-paste).`,
      `Overlap count: ${multi.length} names appear in multiple portfolios.`,
      `Groupthink index: ${multi.length} multi-owned ticker${multi.length === 1 ? "" : "s"}.`,
    ]);
  },

  ({ tickers, rng }) => {
    const dog = [...tickers]
      .filter((t) => t.roiPct < 0 && t.portfolios.length >= 2)
      .sort((a, b) => a.roiPct - b.roiPct)[0];
    if (!dog) return null;
    return pick(rng, [
      `${dog.ticker} is red (${pct1(dog.roiPct)}) yet still loved by ${dog.portfolios.length} books. Loyalty!`,
      `Toxic fave: ${dog.ticker} at ${pct1(dog.roiPct)} but ${dog.portfolios.join(" + ")} won't quit.`,
      `${dog.portfolios.length} books are bagholding ${dog.ticker} together. Bonding exercise.`,
    ]);
  },

  ({ totals, rng }) => {
    const pizzas = Math.max(1, Math.round(totals.totalValue / 25));
    return pick(rng, [
      `Combined NAV could fund ~${pizzas.toLocaleString("en-US")} very serious pizzas (do not).`,
      `In pizza units, the books are worth ~${pizzas.toLocaleString("en-US")} larges. Hungry yet?`,
      `Fun conversion: NAV ÷ €25 ≈ ${pizzas.toLocaleString("en-US")} imaginary pizzas.`,
    ]);
  },

  ({ totals, rng }) => {
    const hours = Math.max(1, Math.round(totals.totalValue / 40));
    return pick(rng, [
      `At a fake €40/hr, the books equal ~${hours.toLocaleString("en-US")} hours of labor. Touch grass accordingly.`,
      `Roughly ${hours.toLocaleString("en-US")} “hourly wage units” of NAV. Capitalism speedrun.`,
    ]);
  },

  ({ tickers, rng }) => {
    const t = pick(rng, tickers);
    const moon = Math.max(1, Math.round(t.shares / 10));
    return pick(rng, [
      `Random draw: ${t.ticker} — ${t.shares.toLocaleString("en-US")} shares, ~$${money(t.currentValue)} of opinions.`,
      `Today’s random spotlight: ${t.ticker} in ${t.portfolios.join(", ")}.`,
      `If each ${t.ticker} share were a step, you’d walk ~${moon.toLocaleString("en-US")} “share-steps”. Science? No.`,
    ]);
  },

  ({ sheets, rng }) => {
    const s = pick(rng, sheets);
    return pick(rng, [
      `${s.portfolio.name} flashcard: $${money(s.totalValue)} NAV · ${pct1(s.roiPct)} ROI · ${s.holdingCount} holdings.`,
      `Sheet of the RNG: ${s.portfolio.name} is ${s.roiPct >= 0 ? "up" : "down"} ${pct1(Math.abs(s.roiPct))} lifetime.`,
      `${s.portfolio.name} today: ${s.todayPct == null ? "quotes pending" : pct1(s.todayPct)} / $${money(s.todayDollar)}.`,
    ]);
  },

  ({ totals, rng }) => {
    return pick(rng, [
      `Census: ${totals.sheetCount} books · ${totals.uniqueTickers} unique tickers · ${totals.positionCount} positions.`,
      `The empire counts ${totals.positionCount} line items across ${totals.sheetCount} sheets.`,
      `${totals.uniqueTickers} distinct tickers is either diversification or a snack drawer.`,
    ]);
  },

  ({ totals, rng }) => {
    if (totals.todayPct == null) return null;
    return pick(rng, [
      `Family day P&L: ${pct1(totals.todayPct)} ($${money(totals.todayDollar)}). ${totals.todayDollar >= 0 ? "Nice." : "Oof."}`,
      `Combined today: $${money(totals.todayDollar)}. The group chat would be ${totals.todayDollar >= 0 ? "unhinged-positive" : "supportive-with-memes"}.`,
      `Intraday family mood: ${totals.todayDollar >= 0 ? "vibing" : "coping"} at ${pct1(totals.todayPct)}.`,
    ]);
  },

  ({ dayKey, rng }) => {
    const weekday = new Date(`${dayKey}T12:00:00+03:00`).toLocaleDateString(
      "en-US",
      { weekday: "long", timeZone: "Europe/Tallinn" }
    );
    return pick(rng, [
      `It's ${weekday} in Tallinn — perfect day to not check prices every 4 minutes (you will anyway).`,
      `${weekday} market folklore: the books refuse to be boring today.`,
      `Tallinn says it's ${weekday}. The tickers have been notified.`,
    ]);
  },

  ({ tickers, rng }) => {
    const withSpark = tickers.filter((t) => t.sparkline.length >= 2);
    if (!withSpark.length) return null;
    const t = pick(rng, withSpark);
    const a = t.sparkline[0]!;
    const b = t.sparkline[t.sparkline.length - 1]!;
    const move = a > 0 ? (b - a) / a : 0;
    return pick(rng, [
      `Sparkline gossip on ${t.ticker}: roughly ${pct1(move)} over the visible window.`,
      `${t.ticker}'s little chart went ${move >= 0 ? "up-ish" : "down-ish"} (~${pct1(move)}).`,
    ]);
  },

  ({ tickers, rng }) => {
    const winners = tickers.filter((t) => t.roiPct > 0).length;
    const losers = tickers.filter((t) => t.roiPct < 0).length;
    return pick(rng, [
      `Lifetime win/loss by ticker: ${winners} ahead · ${losers} behind.`,
      `Scoreboard (ROI): ${winners} green careers, ${losers} redemption arcs.`,
      `${winners} tickers are lifetime up; ${losers} are “accumulating character”.`,
    ]);
  },
];

const FILLERS: FactMaker[] = [
  ({ dayKey, rng }) =>
    pick(rng, [
      `Daily seed ${dayKey}: the fun-fact machine ate its vitamins.`,
      `New batch unlocked for ${dayKey}. Yesterday’s jokes have left the building.`,
      `${dayKey} edition — same books, different nonsense.`,
    ]),
  ({ rng }) =>
    pick(rng, [
      "Reminder: past performance is not indicative of future vibes.",
      "This message sponsored by nobody. Especially not the drama tickers.",
      "If you’re reading this, you scrolled. Respect.",
      "Covered calls don’t write themselves. (Margus might try.)",
    ]),
  ({ sheets, rng }) => {
    const names = sheets.map((s) => s.portfolio.name);
    if (names.length < 2) return `Shout-out to ${names[0] ?? "the book"}.`;
    return pick(rng, [
      `Roll call: ${names.join(" · ")}.`,
      `The Avengers assemble: ${names.join(", ")}.`,
      `House names in the chat: ${names.join(" / ")}.`,
    ]);
  },
];

/**
 * 10 fun facts for the Tallinn calendar day — new set each day, mixed tones.
 */
export function buildDailyFunFacts(
  sheets: SheetScore[],
  tickers: TickerScore[],
  totals: OverviewModel["totals"],
  dayKey: string = todayKeyInTz()
): string[] {
  if (!sheets.length || !tickers.length) return [];

  const rng = mulberry32(hashSeed(`upside-fun|${dayKey}`));
  const ctx: FactCtx = { sheets, tickers, totals, dayKey, rng };

  const makers = shuffleInPlace(rng, [...MAKERS]);
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (s: string | null) => {
    if (!s) return;
    const key = s.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };

  for (const maker of makers) {
    if (out.length >= 10) break;
    try {
      push(maker(ctx));
    } catch {
      /* skip bad maker */
    }
  }

  const fillerPool = shuffleInPlace(rng, [...FILLERS, ...MAKERS]);
  for (const maker of fillerPool) {
    if (out.length >= 10) break;
    try {
      push(maker(ctx));
    } catch {
      /* skip */
    }
  }

  while (out.length < 10) {
    push(
      `Bonus bit #${out.length + 1} for ${dayKey}: the books are still weird and that’s the point.`
    );
  }

  return out.slice(0, 10);
}
