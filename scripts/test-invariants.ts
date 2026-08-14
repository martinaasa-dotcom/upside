/**
 * Product invariants from the Aug 2026 review.
 * Run: npx tsx scripts/test-invariants.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  BRIEFING_KIND_LABEL,
  BRIEFING_PULSE_CTA,
  buildInvestorBriefing,
} from "../src/lib/investor-briefing";
import { usdToDisplay, displayToUsd } from "../src/lib/display-currency";
import { liveFundTodayMove } from "../src/lib/margus-fund-mark";
import { fundCopyBullets } from "../src/lib/fund-copy";
import { playbookBullets } from "../src/lib/forecast-playbook";
import { reconcilePulseCheck, statusLabel, type PulseCheck } from "../src/lib/thesis-pulse";
import { humanizeMargusTree, humanizeMargusText } from "../src/lib/ai/humanize-copy";
import { LAB_TAB_ID, PULSE_TAB_ID } from "../src/lib/overview";
import { shouldHideOptions, TIER_HIDDEN_META_TABS } from "../src/lib/experience-tier";
import {
  asSurpriseFraction,
  buildEarningsNote,
  medianAbs,
  priceRange,
  sessionReaction,
} from "../src/lib/earnings-brief";
import { sessionMark } from "../src/lib/market-session";
import { quotePollMs } from "../src/lib/market/session";
import { mergeQuotes } from "../src/lib/quote-cache";
import {
  closeOnDate,
  portfolioCostValue,
  portfolioValueOnDate,
  priorNySessionKey,
  quotesCoverDate,
  sheetReturnPathSince,
} from "../src/lib/sheet-mark";
import { sanitizeFundWatchlist } from "../src/lib/fund-watchlist";
import type { OverviewModel } from "../src/lib/overview";
import type { UpsideAlert } from "../src/lib/alerts";

function emptyModel(): OverviewModel {
  return {
    sheets: [],
    tickers: [],
    winners: [],
    losers: [],
    todayWinners: [],
    todayLosers: [],
    topHoldings: [],
    funFacts: [],
    totals: {
      totalValue: 10_000,
      equityValue: 8_000,
      cash: 2_000,
      buyValue: 9_000,
      roiDollar: 1_000,
      roiPct: 0.11,
      todayDollar: 120,
      todayPct: 0.012,
      sheetCount: 1,
      positionCount: 0,
      uniqueTickers: 0,
    },
  } as OverviewModel;
}

function check(partial: Partial<PulseCheck>): PulseCheck {
  return {
    ticker: "TEST",
    situation: ["x"],
    moveReason: "y",
    thesisStatus: "intact",
    earningsNote: "",
    action: "hold",
    trimPct: null,
    addLevel: "",
    verdict: "z",
    ...partial,
  };
}

let failed = 0;
function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`fail  ${name}`);
    console.error(err);
  }
}

run("Pulse CTA is offered when Pulse is reachable, even if Lab is hidden", () => {
  const items = buildInvestorBriefing({
    model: emptyModel(),
    activeAlerts: [],
    coveredCallRows: [],
    hideOptions: true,
    canReachPulse: true,
    dayKey: "2026-08-14",
  });
  const day = items.find((i) => i.id.startsWith("day-"));
  assert.ok(day, "day card exists");
  assert.equal(day?.link?.type, "pulse");
  assert.equal(day?.cta, BRIEFING_PULSE_CTA);
});

run("briefing kinds use plain-English labels", () => {
  assert.equal(BRIEFING_KIND_LABEL.action, "Look at this");
  assert.equal(BRIEFING_KIND_LABEL.watch, "Note");
  assert.equal(BRIEFING_KIND_LABEL.play, "A thought");
});

run("options UI is hidden unless the viewer explicitly said yes", () => {
  assert.equal(shouldHideOptions(true), false);
  assert.equal(shouldHideOptions(false), true);
  assert.equal(shouldHideOptions(null), true);
});

run("Home briefing never rotates a covered-call pep talk", () => {
  const withOptions = buildInvestorBriefing({
    model: emptyModel(),
    activeAlerts: [],
    coveredCallRows: [],
    hideOptions: false,
    canReachPulse: true,
    dayKey: "2026-08-14",
  });
  const hidden = buildInvestorBriefing({
    model: emptyModel(),
    activeAlerts: [],
    coveredCallRows: [],
    hideOptions: true,
    canReachPulse: true,
    dayKey: "2026-08-14",
  });
  for (const items of [withOptions, hidden]) {
    assert.ok(!items.some((i) => /write when|sell a call|call premium/i.test(`${i.title} ${i.detail}`)));
  }
});

run("covered-call briefing opens the options table, not just the sheet", () => {
  const items = buildInvestorBriefing({
    model: emptyModel(),
    activeAlerts: [],
    coveredCallRows: [
      {
        holding: {
          id: "h1",
          portfolio_id: "sheet-a",
          ticker: "NBIS",
          shares: 100,
          buy_price: 10,
          eoy_target: null,
          target_call_pct: 0.15,
          stock_target_override: null,
          sort_order: 0,
        },
        spot: 100,
        totalValue: 10_000,
        yield2w: 0.01,
        premium: 18_404,
        targetCall: 0.15,
        stockTarget: 120,
        targetDistance: 0.2,
        nextStrike: 138,
        expiration: "2026-09-01",
        contracts: 1,
        option: null,
      },
    ],
    hideOptions: false,
    canReachPulse: true,
    dayKey: "2026-08-14",
  });
  const cc = items.find((i) => i.id.startsWith("cc-season-"));
  assert.ok(cc, "premium card exists when options are on");
  assert.equal(cc?.link?.type, "sheet");
  assert.equal(cc?.link && cc.link.type === "sheet" ? cc.link.portfolioId : null, "sheet-a");
  assert.equal(cc?.link && cc.link.type === "sheet" ? cc.link.focus : null, "covered-calls");
});

run("earnings surprise parses both fractions and percent points", () => {
  assert.equal(asSurpriseFraction(0.041), 0.041);
  assert.ok(Math.abs((asSurpriseFraction("4.1") ?? 0) - 0.041) < 1e-10);
  assert.ok(Math.abs((asSurpriseFraction(4.1) ?? 0) - 0.041) < 1e-10);
});

run("earnings range is spot plus or minus the expected move", () => {
  const { low, high } = priceRange(200, 0.1);
  assert.equal(low, 180);
  assert.ok(Math.abs(high - 220) < 1e-9);
  assert.equal(medianAbs([-0.02, 0.08, -0.01, 0.04]), 0.03);
});

run("after-hours earnings reaction uses the next session", () => {
  const bars = [
    { date: "2026-05-19", close: 220 },
    { date: "2026-05-20", close: 223 },
    { date: "2026-05-21", close: 219 },
  ];
  const afterHours = new Date("2026-05-20T20:20:00.000Z");
  const move = sessionReaction(bars, afterHours);
  assert.ok(move != null);
  assert.equal(Math.round(move! * 1000) / 1000, Math.round((219 / 223 - 1) * 1000) / 1000);
});

run("earnings note flags a stretched run-in without sounding like a slogan", () => {
  const note = buildEarningsNote({
    expectedMovePct: 0.07,
    runupPct: 0.18,
    beatCount: 4,
    printCount: 4,
    typicalAbsMovePct: 0.05,
  });
  assert.match(note, /Up 18%/);
  assert.match(note, /±7%/);
  assert.match(note, /lighten/);
  assert.doesNotMatch(note, /—/);
});

run("closed session keeps last print vs yesterday close, including leftover after-hours", () => {
  const closedAh = sessionMark({
    marketState: "CLOSED",
    regularPrice: 100,
    postPrice: 102,
    prePrice: null,
    previousClose: 90,
  });
  assert.equal(closedAh.price, 102);
  assert.equal(closedAh.previousClose, 90);

  const closedFlat = sessionMark({
    marketState: "CLOSED",
    regularPrice: 100,
    postPrice: null,
    prePrice: null,
    previousClose: 90,
  });
  assert.equal(closedFlat.price, 100);
  assert.equal(closedFlat.previousClose, 90);

  const pre = sessionMark({
    marketState: "PRE",
    regularPrice: 100,
    postPrice: null,
    prePrice: 101,
    previousClose: 90,
  });
  assert.equal(pre.price, 101);
  assert.equal(pre.previousClose, 100);

  const preBeforeFirstTick = sessionMark({
    marketState: "PRE",
    regularPrice: 100,
    postPrice: 102,
    prePrice: null,
    previousClose: 90,
  });
  assert.equal(preBeforeFirstTick.price, 102);
  assert.equal(preBeforeFirstTick.previousClose, 100);

  const closedPrefersAhOverMorningPre = sessionMark({
    marketState: "CLOSED",
    regularPrice: 100,
    postPrice: 102,
    prePrice: 103,
    previousClose: 90,
  });
  assert.equal(closedPrefersAhOverMorningPre.price, 102);
  assert.equal(closedPrefersAhOverMorningPre.previousClose, 90);

  const closedIgnoresStaleMorningPre = sessionMark({
    marketState: "CLOSED",
    regularPrice: 100,
    postPrice: null,
    prePrice: 103,
    previousClose: 90,
  });
  assert.equal(closedIgnoresStaleMorningPre.price, 100);
  assert.equal(closedIgnoresStaleMorningPre.previousClose, 90);

  const closedUnflattenAh = sessionMark({
    marketState: "CLOSED",
    regularPrice: 100,
    postPrice: 102,
    prePrice: null,
    previousClose: 102,
  });
  assert.equal(closedUnflattenAh.price, 102);
  assert.equal(closedUnflattenAh.previousClose, 100);

  const preUnflatten = sessionMark({
    marketState: "PRE",
    regularPrice: 101,
    postPrice: null,
    prePrice: 101,
    previousClose: 100,
  });
  assert.equal(preUnflatten.price, 101);
  assert.equal(preUnflatten.previousClose, 100);
});

run("flat overnight quotes keep the last real previous close", () => {
  const prev = {
    NVDA: {
      ticker: "NVDA",
      price: 225.3,
      change: 1.21,
      changePercent: 0.0054,
      previousClose: 224.09,
      sparkline: [],
      marketState: "CLOSED",
      preMarketPrice: null,
      preMarketChange: null,
      preMarketChangePercent: null,
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePercent: null,
    },
  };
  const incoming = {
    NVDA: {
      ...prev.NVDA,
      price: 225.3,
      change: 0,
      changePercent: 0,
      previousClose: 225.3,
    },
  };
  const merged = mergeQuotes(prev, incoming);
  assert.equal(merged.NVDA?.previousClose, 224.09);
  assert.ok((merged.NVDA?.change ?? 0) > 1);

  const regularIncoming = {
    NVDA: {
      ...prev.NVDA,
      marketState: "REGULAR",
      price: 225.3,
      change: 0,
      changePercent: 0,
      previousClose: 225.3,
    },
  };
  const regularMerged = mergeQuotes(prev, regularIncoming);
  assert.equal(regularMerged.NVDA?.previousClose, 225.3);
});

run("quote polls stay live through pre-market and after hours", () => {
  // Friday 14 Aug 2026, America/New_York is EDT (UTC-4).
  assert.equal(quotePollMs(new Date("2026-08-14T12:00:00Z")), 45_000); // 08:00 ET pre
  assert.equal(quotePollMs(new Date("2026-08-14T15:00:00Z")), 45_000); // 11:00 ET open
  assert.equal(quotePollMs(new Date("2026-08-14T21:00:00Z")), 45_000); // 17:00 ET AH
  assert.equal(quotePollMs(new Date("2026-08-15T01:30:00Z")), 2 * 60_000); // 21:30 ET Fri
  assert.equal(quotePollMs(new Date("2026-08-15T14:00:00Z")), 15 * 60_000); // 10:00 ET Sat
});

run("sheet mark as-of a pin date uses that session's close, not last night's", () => {
  assert.equal(priorNySessionKey("2026-08-12"), "2026-08-11");
  assert.equal(priorNySessionKey("2026-08-10"), "2026-08-07");

  const q = {
    ticker: "NBIS",
    price: 260,
    change: 5,
    changePercent: 0.02,
    previousClose: 255,
    sparkline: [],
    marketState: "PRE",
    preMarketPrice: 260,
    preMarketChange: 5,
    preMarketChangePercent: 0.02,
    postMarketPrice: null,
    postMarketChange: null,
    postMarketChangePercent: null,
    dailyCloses: [
      { date: "2026-08-11", close: 200 },
      { date: "2026-08-12", close: 250 },
      { date: "2026-08-13", close: 255 },
    ],
  };
  assert.equal(closeOnDate(q, "2026-08-11"), 200);
  const meta = { id: "aasad", cash_balance: 0 };
  const holdings = [
    { portfolio_id: "aasad", ticker: "NBIS", shares: 500, buy_price: 110 },
  ];
  const asOf = portfolioValueOnDate(meta, holdings, { NBIS: q }, "2026-08-11");
  assert.equal(asOf, 100_000);
  const liveCost = portfolioCostValue(meta, holdings);
  assert.equal(liveCost, 55_000);
  assert.equal(quotesCoverDate({ NBIS: q }, holdings, "aasad", "2026-08-11"), true);
  assert.equal(quotesCoverDate({ NBIS: q }, holdings, "aasad", "2026-01-01"), false);

  const path = sheetReturnPathSince({
    labels: ["2026-08-11", "2026-08-12", "2026-08-13", "Live"],
    baselineDate: "2026-08-12",
    baselineValue: 100_000,
    liveValue: 130_000,
    meta,
    holdings,
    quotes: { NBIS: q },
  });
  assert.deepEqual(
    path.map((n) => Math.round(n * 1000) / 1000),
    [0, 0.25, 0.275, 0.3]
  );
});

run("fund today move is live NAV minus last snapshot", () => {
  const move = liveFundTodayMove({ liveTotal: 110, lastReportValue: 100 });
  assert.equal(move.todayDollar, 10);
  assert.equal(move.todayPct, 0.1);
  const missing = liveFundTodayMove({ liveTotal: 110, lastReportValue: null });
  assert.equal(missing.todayDollar, 0);
  assert.equal(missing.todayPct, null);
});

run("fund thesis and exit plans split into short bullets", () => {
  const thesis = fundCopyBullets(
    "Data cloud consumption accelerating with GenAI workloads; remaining performance obligations (RPO) up >50% YoY, signaling durable multi-year expansion as enterprises unify analytics and AI pipelines."
  );
  assert.deepEqual(thesis, [
    "Data cloud consumption accelerating with GenAI workloads",
    "RPO up >50% YoY",
    "Durable multi-year expansion",
    "Enterprises unify analytics and AI pipelines",
  ]);
  const exit = fundCopyBullets(
    "Sell if product revenue growth decelerates below 25% YoY for two quarters or if adjusted FCF margin fails to exceed 20% by FY28."
  );
  assert.deepEqual(exit, [
    "Product revenue growth below 25% YoY for two quarters",
    "Adjusted FCF margin below 20% by FY28",
  ]);
});

run("forecast add/trim lines split into bullets", () => {
  assert.deepEqual(playbookBullets("Hold, no add"), []);
  assert.deepEqual(playbookBullets("Nothing, just hold"), []);
  const sleeve = playbookBullets(
    "AI power / $CEG or $VST (~0% to 5%): initiate on pullbacks to build exposure before next grid interconnect auctions."
  );
  assert.equal(sleeve.length, 1);
  assert.equal(sleeve[0]?.head, "AI power / $CEG or $VST (~0% to 5%)");
  assert.match(sleeve[0]?.detail ?? "", /Initiate on pullbacks/);
  const packed = playbookBullets(
    "$NBIS (40.5% -> 35%) / $CRWV (36.8% -> 32%): trim into pre-earnings run-ups above $285 and $120 to curb cluster concentration."
  );
  assert.equal(packed.length, 2);
  assert.equal(packed[0]?.head, "$NBIS · 40.5% → 35%");
  assert.equal(packed[1]?.head, "$CRWV · 36.8% → 32%");
  assert.match(packed[0]?.detail ?? "", /Trim into pre-earnings/);
  const listed = playbookBullets(
    "$RKLB (14% -> 9%): fade the launch print; SaaS sleeve (~3%): start a small sleeve on a red day"
  );
  assert.equal(listed.length, 2);
  assert.equal(listed[0]?.head, "$RKLB · 14% → 9%");
  assert.equal(listed[1]?.head, "SaaS sleeve (~3%)");
});

run("Pulse CTA is omitted when Pulse is not reachable", () => {
  const items = buildInvestorBriefing({
    model: emptyModel(),
    activeAlerts: [],
    coveredCallRows: [],
    canReachPulse: false,
    dayKey: "2026-08-14",
  });
  const day = items.find((i) => i.id.startsWith("day-"));
  assert.equal(day?.link, undefined);
});

run("Each alert becomes its own briefing card", () => {
  const alerts: UpsideAlert[] = [
    {
      id: "a1",
      kind: "earnings",
      title: "NBIS reports soon",
      detail: "Three days out.",
      ticker: "NBIS",
      at: 1,
    },
    {
      id: "a2",
      kind: "info",
      title: "One name is most of the book",
      detail: "CRWV is 40%.",
      ticker: "CRWV",
      at: 2,
    },
  ];
  const items = buildInvestorBriefing({
    model: emptyModel(),
    activeAlerts: alerts,
    coveredCallRows: [],
    canReachPulse: true,
    dayKey: "2026-08-14",
  });
  assert.ok(items.some((i) => i.id === "alert-a1"));
  assert.ok(items.some((i) => i.id === "alert-a2"));
  assert.ok(!items.some((i) => i.title.includes("things need a look")));
});

run("broken + trim becomes sell", () => {
  const next = reconcilePulseCheck(
    check({ thesisStatus: "broken", action: "trim", trimPct: 20 })
  );
  assert.equal(next.action, "sell");
  assert.equal(next.trimPct, null);
});

run("broken + hold becomes watch", () => {
  const next = reconcilePulseCheck(
    check({ thesisStatus: "broken", action: "hold" })
  );
  assert.equal(next.thesisStatus, "watch");
  assert.equal(next.action, "hold");
});

run("broken + add becomes watch", () => {
  const next = reconcilePulseCheck(
    check({ thesisStatus: "broken", action: "add" })
  );
  assert.equal(next.thesisStatus, "watch");
});

run("title-cased Pulse enums no longer paint intact as at-risk", () => {
  const next = reconcilePulseCheck(
    check({
      thesisStatus: "Intact" as PulseCheck["thesisStatus"],
      action: "Hold" as PulseCheck["action"],
      situation: [
        "No stress signal from today's move.",
        "Position stays in normal monitoring mode.",
      ],
      verdict: "Hold and reassess on new catalysts, earnings, or thesis-changing news.",
    })
  );
  assert.equal(next.thesisStatus, "intact");
  assert.equal(next.action, "hold");
  assert.equal(statusLabel(next.thesisStatus), "Thesis intact");
  assert.equal(statusLabel("Intact"), "Thesis intact");
  assert.equal(statusLabel("broken"), "Thesis at risk");
});

run("humanize does not title-case Pulse enums", () => {
  const tree = humanizeMargusTree({
    thesisStatus: "intact",
    action: "hold",
    verdict: "it's important to note that the dip is noise.",
  });
  assert.equal(tree.thesisStatus, "intact");
  assert.equal(tree.action, "hold");
  assert.equal(tree.verdict, "The dip is noise.");
});

run("humanize still recapitalizes after stripping a leading opener", () => {
  assert.equal(
    humanizeMargusText("it's important to note that the dip is noise."),
    "The dip is noise."
  );
});

run("novice hides Lab, not Pulse", () => {
  assert.ok(TIER_HIDDEN_META_TABS.novice.includes(LAB_TAB_ID));
  assert.ok(!TIER_HIDDEN_META_TABS.novice.includes(PULSE_TAB_ID));
});

run("FX conversion falls back to 1:1 and rounds to cents", () => {
  assert.equal(usdToDisplay(100.004, "USD", null), 100);
  assert.equal(usdToDisplay(100, "EUR", null), 100);
  assert.equal(usdToDisplay(100, "EUR", 0), 100);
  assert.equal(displayToUsd(50, "EUR", null), 50);
});

run("home keeps Fund and Communities in view", () => {
  const overview = readFileSync("src/components/OverviewDashboard.tsx", "utf8");
  const world = readFileSync("src/components/HomeWorld.tsx", "utf8");
  assert.ok(overview.includes("HomeWorld"));
  assert.ok(!overview.includes("CommunitiesSpotlight"));
  assert.ok(world.includes("Around Upside Lab"));
  assert.ok(world.includes("Upside Fund"));
  assert.ok(world.includes("Communities"));
});

run("product is Upside Lab on upsidelab.app", () => {
  const product = readFileSync("src/lib/product.ts", "utf8");
  assert.match(product, /PRODUCT_NAME = "Upside Lab"/);
  assert.match(product, /PRODUCT_DOMAIN = "upsidelab.app"/);
  const site = readFileSync("src/lib/site-url.ts", "utf8");
  assert.match(site, /PRODUCT_DOMAIN/);
  assert.match(site, /LEGACY_HOSTS/);
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(layout, /PRODUCT_NAME/);
  const envEx = readFileSync(".env.example", "utf8");
  assert.match(envEx, /upsidelab\.app/);
  assert.doesNotMatch(envEx, /jwjezdgggrgdgfsovgtx/);
});

/* ---------- design system ---------- */

function componentSources(): { file: string; src: string }[] {
  const dirs = ["src/components", "src/components/ui", "src/app"];
  const out: { file: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".tsx")) {
        out.push({ file: path, src: readFileSync(path, "utf8") });
      }
    }
  };
  for (const d of dirs) walk(d);
  return out;
}

/** Source with comments stripped, so rules about shipped code and rules
 * about shipped copy never trip over each other's explanations. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const sources = componentSources().map(({ file, src }) => ({
  file,
  src: code(src),
}));

function offendersOf(pattern: RegExp): string[] {
  return [
    ...new Set(
      sources.filter(({ src }) => pattern.test(src)).map(({ file }) => file)
    ),
  ];
}

run("no type below 12px anywhere a person reads", () => {
  const offenders = offendersOf(/text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/);
  assert.deepEqual(
    offenders,
    [],
    `sub-12px type is unreadable on a phone, use text-xs. Offenders: ${offenders.join(", ")}`
  );
});

run("one letter-spacing scale on small caps labels", () => {
  const offenders = offendersOf(/tracking-(?:wider|widest)/);
  assert.deepEqual(
    offenders,
    [],
    `tracking-wide is the only caps tracking, wider reads as a second design. Offenders: ${offenders.join(", ")}`
  );
});

run("Montserrat headings and Inter body, no third face", () => {
  const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const logo = readFileSync(
    join(process.cwd(), "src/components/UpsideLogo.tsx"),
    "utf8"
  );
  assert.match(layout, /Montserrat/);
  assert.match(layout, /Inter/);
  assert.doesNotMatch(layout, /Newsreader|Outfit|JetBrains/);
  assert.match(css, /font-montserrat/);
  assert.match(css, /font-inter/);
  assert.match(css, /--font-heading: var\(--font-montserrat\)/);
  assert.match(css, /--font-sans: var\(--font-inter\)/);
  assert.match(css, /--font-logo: var\(--font-montserrat\)/);
  assert.doesNotMatch(css, /font-newsreader|font-outfit/);
  assert.match(code(logo), /font-logo/);
  assert.match(code(logo), /uppercase/);
  assert.match(code(logo), /Upside/);
  assert.match(code(logo), /Lab/);
  assert.doesNotMatch(code(logo), /tracking-\[0\./);
});

run("mover rows label price, today, lifetime, and book", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/OverviewDashboard.tsx"),
    "utf8"
  );
  const row = src.slice(
    src.indexOf("function MoverRow"),
    src.indexOf("function PortfolioLane")
  );
  assert.match(row, /label="Price"/);
  assert.match(row, /label="Today"/);
  assert.match(row, /label="Lifetime"/);
  assert.match(row, /label="Book"/);
  assert.match(row, />Recent</);
  assert.doesNotMatch(row, /justify-between/);
});

run("rounded-2xl is the panel radius, nothing rounder", () => {
  const offenders = offendersOf(/rounded-3xl/);
  assert.deepEqual(
    offenders,
    [],
    `panels are rounded-2xl, cards rounded-xl, controls rounded-lg. Offenders: ${offenders.join(", ")}`
  );
});

run("no em dashes in user-facing copy", () => {
  // A bare "—" standing in for a missing value is allowed and everywhere.
  // What's banned is the dash used as sentence punctuation, so this only
  // fires when there's a real word on both sides of it.
  const offenders = offendersOf(/[\p{L}\d]\s*—\s*[\p{L}\d]/u);
  assert.deepEqual(
    offenders,
    [],
    `em dashes are the biggest AI tell, use a period or comma. Offenders: ${offenders.join(", ")}`
  );
});

run("live price polls back off when New York is closed", () => {
  // A flat setInterval on quotes burns the shared free-tier rate limit all
  // night re-fetching the same close. Anything that polls prices has to ask
  // marketSession/quotePollMs what the right cadence is right now.
  const pollers = [
    "Dashboard.tsx",
    "UpsidePortfolioPage.tsx",
    "MacroStrip.tsx",
    "CommunityView.tsx",
  ];
  const offenders = pollers.filter((name) => {
    const found = sources.find(({ file }) => file.endsWith(name));
    return !found || !/marketSession|quotePollMs/.test(found.src);
  });
  assert.deepEqual(
    offenders,
    [],
    `these poll prices without checking the session: ${offenders.join(", ")}`
  );
});

run("every tier's default surface uses the shared Panel shell", () => {
  // The drift this catches: a new screen hand-rolls its own border+bg and the
  // app grows a fourth dialect. If a file draws a top-level section, it should
  // be getting the shell from ui/Panel.
  const shells = [
    "OverviewDashboard.tsx",
    "PulsePage.tsx",
    "ForecastPanel.tsx",
    "LabSheet.tsx",
    "CoveredCallPanel.tsx",
    "CompoundInterestSheet.tsx",
    "TickerDrawer.tsx",
    "ScenarioSimulator.tsx",
  ];
  const offenders = shells.filter((name) => {
    const found = sources.find(({ file }) => file.endsWith(name));
    return !found || !/from "@\/components\/ui\/Panel"/.test(found.src);
  });
  assert.deepEqual(
    offenders,
    [],
    `these draw their own panel shell instead of using ui/Panel: ${offenders.join(", ")}`
  );
});

run("quote clients honor the CDN cache", () => {
  const files = [
    "src/components/Dashboard.tsx",
    "src/components/PulsePage.tsx",
    "src/components/MacroStrip.tsx",
    "src/components/CommunityView.tsx",
    "src/components/UpsidePortfolioPage.tsx",
  ];
  for (const rel of files) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    assert.doesNotMatch(
      src,
      /quotesUrl\([^)]*\),\s*\{\s*cache:\s*"no-store"/,
      `${rel} still bypasses /api/quotes CDN cache`
    );
    assert.doesNotMatch(
      src,
      /\/api\/quotes[^`]*cache:\s*"no-store"/,
      `${rel} still bypasses /api/quotes CDN cache`
    );
  }
  const route = readFileSync(
    join(process.cwd(), "src/app/api/quotes/route.ts"),
    "utf8"
  );
  assert.match(route, /Vercel-CDN-Cache-Control/);
  assert.doesNotMatch(route, /force-dynamic/);
});

run("own-book compare also draws on the Margus vs SPY chart", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/UpsidePortfolioPage.tsx"),
    "utf8"
  );
  assert.match(src, /sheetReturnPathSince/);
  const chart = src.slice(
    src.indexOf("const comparisonSeries"),
    src.indexOf("const fetchMyPortfolios")
  );
  assert.match(chart, /youReturnSeries/);
  assert.match(chart, /SERIES_COLOR\.you/);
});

run("fund stats speak in percent and dollars, not points", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/UpsidePortfolioPage.tsx"),
    "utf8"
  );
  assert.doesNotMatch(code(src), /\dpt\b|pt vs SPY|ahead by|vs cost|Dead even over this window/);
});

run("fund watchlist drops names he already holds", () => {
  const cleaned = sanitizeFundWatchlist(
    [
      { ticker: "$SNOW", waitFor: "A 10% dip off the highs" },
      { ticker: "snow", waitFor: "duplicate" },
      { ticker: "AVGO", waitFor: "Wait for a cleaner print" },
      { ticker: "!!!", waitFor: "junk" },
      { ticker: "PLTR", waitFor: "   " },
    ],
    ["SNOW"]
  );
  assert.deepEqual(
    cleaned.map((w) => w.ticker),
    ["AVGO"]
  );
});

run("fund page names cash purpose and the watchlist", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/UpsidePortfolioPage.tsx"),
    "utf8"
  );
  assert.match(src, /Watching/);
  assert.match(src, /Cash is sitting for/);
  assert.doesNotMatch(code(src), /Dry powder/);
});

run("first-run is import, not an empty named sheet", () => {
  const dash = readFileSync(
    join(process.cwd(), "src/components/Dashboard.tsx"),
    "utf8"
  );
  assert.doesNotMatch(dash, /DashboardWelcome/);
  assert.match(dash, /FIRST_SHEET_NAME/);
  assert.match(dash, /ensureFirstSheet/);
  const welcomeGone = (() => {
    try {
      readFileSync(
        join(process.cwd(), "src/components/DashboardWelcome.tsx"),
        "utf8"
      );
      return false;
    } catch {
      return true;
    }
  })();
  assert.equal(welcomeGone, true, "DashboardWelcome.tsx should be deleted");
  const overview = readFileSync(
    join(process.cwd(), "src/components/OverviewDashboard.tsx"),
    "utf8"
  );
  assert.match(overview, /Upload a CSV/);
  assert.match(overview, /Import a screenshot/);
  assert.doesNotMatch(overview, /watch the Upside Fund or start a circle below/);
});

run("sign-in reads as a product", () => {
  const product = readFileSync(
    join(process.cwd(), "src/lib/product.ts"),
    "utf8"
  );
  assert.match(product, /SIGNIN_WHO/);
  assert.match(product, /SIGNIN_POINTS/);
  const gate = readFileSync(
    join(process.cwd(), "src/components/SignInGate.tsx"),
    "utf8"
  );
  assert.match(gate, /PRODUCT_SENTENCE/);
  assert.match(gate, /SIGNIN_WHO/);
  assert.match(gate, /SIGNIN_POINTS/);
  assert.doesNotMatch(gate, /\$50k|AI manage/);
});

run("empty book does not lead with Fund", () => {
  const overview = readFileSync(
    join(process.cwd(), "src/components/OverviewDashboard.tsx"),
    "utf8"
  );
  const emptyBlock = overview.slice(
    overview.indexOf("if (bookIsEmpty)"),
    overview.indexOf("return (", overview.indexOf("if (bookIsEmpty)") + 40)
  );
  // The empty return must not render HomeWorld.
  const emptyFn = overview.slice(
    overview.indexOf("function EmptyBook"),
    overview.indexOf("function BriefingCard")
  );
  assert.doesNotMatch(emptyFn, /HomeWorld/);
  void emptyBlock;
});

run("lab sync writes conviction only", () => {
  const client = readFileSync(
    join(process.cwd(), "src/lib/lab-sync-client.ts"),
    "utf8"
  );
  const bundle = readFileSync(
    join(process.cwd(), "src/lib/lab-bundle.ts"),
    "utf8"
  );
  const api = readFileSync(join(process.cwd(), "src/app/api/lab/route.ts"), "utf8");
  assert.match(client, /conviction: bundle.conviction/);
  assert.doesNotMatch(client, /cashflows: bundle.cashflows/);
  assert.doesNotMatch(client, /arena: bundle.arena/);
  assert.doesNotMatch(bundle, /journal|cashflows|arena|badges/);
  assert.doesNotMatch(api, /journal|cashflows|defaultArena|badges/);
});

run("holdings table does not fake a thesis-intact badge", () => {
  const table = readFileSync(
    join(process.cwd(), "src/components/PortfolioTable.tsx"),
    "utf8"
  );
  assert.doesNotMatch(table, /Thesis intact/);
  assert.doesNotMatch(table, /ShieldCheck/);
});

run("Account is not a workspace room", () => {
  const switcher = readFileSync(
    join(process.cwd(), "src/components/WorkspaceSwitcher.tsx"),
    "utf8"
  );
  const header = readFileSync(
    join(process.cwd(), "src/components/AppHeader.tsx"),
    "utf8"
  );
  assert.doesNotMatch(switcher, /"Account"/);
  assert.match(header, /\{showWorkspaceNav && <WorkspaceSwitcher \/>\}\s*\{end\}/);
});

run("Forecast is always the base case", () => {
  const panel = readFileSync(
    join(process.cwd(), "src/components/ForecastPanel.tsx"),
    "utf8"
  );
  const route = readFileSync(
    join(process.cwd(), "src/app/api/forecast/plan/route.ts"),
    "utf8"
  );
  const plan = readFileSync(
    join(process.cwd(), "src/lib/forecast-plan.ts"),
    "utf8"
  );
  assert.doesNotMatch(panel, /Cautious/);
  assert.doesNotMatch(panel, /Optimistic/);
  assert.doesNotMatch(route, /requestedStance/);
  assert.doesNotMatch(route, /body\.stance/);
  assert.doesNotMatch(plan, /STANCE = BEARISH/);
  assert.doesNotMatch(plan, /STANCE = BULLISH/);
});

run("Daily Duel is not on Home", () => {
  const home = readFileSync(
    join(process.cwd(), "src/components/OverviewDashboard.tsx"),
    "utf8"
  );
  assert.doesNotMatch(home, /DailyDuelCard/);
});

run("options onboarding is regularly-only", () => {
  const onboarding = readFileSync(
    join(process.cwd(), "src/components/ExperienceOnboardingModal.tsx"),
    "utf8"
  );
  assert.match(onboarding, /q2 === "regularly"/);
  assert.doesNotMatch(onboarding, /q2 !== "never"/);
});

run("nightly snapshots can store mark-to-market", () => {
  const snap = readFileSync(
    join(process.cwd(), "src/lib/book-snapshot.ts"),
    "utf8"
  );
  const cron = readFileSync(
    join(process.cwd(), "src/app/api/cron/snapshot/route.ts"),
    "utf8"
  );
  assert.match(snap, /computeSnapshotMarks/);
  assert.match(cron, /payload.marks = computeSnapshotMarks/);
});

run("Pulse never nags that it is guessing", () => {
  const pulse = readFileSync(
    join(process.cwd(), "src/components/PulsePage.tsx"),
    "utf8"
  );
  const chat = readFileSync(
    join(process.cwd(), "src/app/api/chat/route.ts"),
    "utf8"
  );
  const model = readFileSync(
    join(process.cwd(), "src/lib/ai/model.ts"),
    "utf8"
  );
  assert.doesNotMatch(pulse, /Pulse is guessing/);
  assert.doesNotMatch(pulse, /Write why you own/);
  assert.doesNotMatch(pulse, /Pulling news/);
  assert.match(pulse, /buildFallbackPulseCheck/);
  assert.match(pulse, /<ActionBadge action=\{action\} \/>/);
  assert.doesNotMatch(chat, /backup on your next/);
  assert.doesNotMatch(chat, /The model provider is overloaded/);
  assert.match(chat, /fallbackChatResponse/);
  assert.doesNotMatch(model, /The model provider is overloaded/);
});

run("panel copy is not pinched to a reading measure", () => {
  const files = [
    "src/components/ui/Panel.tsx",
    "src/components/LabSheet.tsx",
    "src/components/PulsePage.tsx",
    "src/components/SeasonalityPage.tsx",
    "src/components/OverviewDashboard.tsx",
    "src/components/ForecastPanel.tsx",
  ];
  for (const rel of files) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    assert.doesNotMatch(
      src,
      /max-w-(?:xl|2xl|prose)/,
      `${rel} still caps in-panel copy so it wraps short of the card`
    );
  }
});

if (failed > 0) {
  console.error(`\n${failed} invariant(s) failed`);
  process.exit(1);
}
console.log("\nall invariants passed");
