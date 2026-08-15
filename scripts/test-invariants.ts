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
import { liveFundTodayMove, liveFundTotalValue } from "../src/lib/margus-fund-mark";
import { fundCopyBullets } from "../src/lib/fund-copy";
import {
  applyYtdAnchor,
  downsampleToWeeks,
  paintBookNavSeries,
  reconstructAssumedNav,
  startNavFromYtdPct,
} from "../src/lib/market/assumed-nav";
import { playbookBullets } from "../src/lib/forecast-playbook";
import { shouldAutoRefreshForecast } from "../src/lib/forecast-plan";
import {
  cleanThesisBreak,
  isBigPulseMove,
  isGenericThesisBreak,
  pulseLeftHold,
  reconcilePulseCheck,
  shouldAutoPulseTicker,
  sortPulseCandidates,
  statusLabel,
  verdictRepeatsTrim,
  type PulseCheck,
} from "../src/lib/thesis-pulse";
import {
  beginBackgroundLlm,
  chatIsBusy,
  endBackgroundLlm,
  markChatActive,
} from "../src/lib/ai/llm-slots";
import { humanizeMargusTree, humanizeMargusText } from "../src/lib/ai/humanize-copy";
import {
  inviteFromLocation,
  inviteLandingCopy,
} from "../src/lib/invite-landing";
import { LAB_TAB_ID, PULSE_TAB_ID, todayDollarFor, buildOverview } from "../src/lib/overview";
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
import {
  isLegacyHost,
  normalizeHostname,
  safeInternalPath,
} from "../src/lib/site-url";
import { validateServerEnv } from "../src/lib/env-schema";
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
import {
  FALLBACK_POPULAR_TICKERS,
  POPULAR_TICKER_COUNT,
  currentPopularMonth,
  sanitizePopularTickers,
} from "../src/lib/popular-tickers";
import {
  localTickerSuggestions,
  mergeTickerSuggestions,
} from "../src/lib/market/ticker-search";
import { watchLook } from "../src/lib/watch-look";
import {
  formatEarningsCalendarBlock,
  resolveYahooEarnings,
} from "../src/lib/market/earnings-dates";
import { buildCcSystemPrompt, type CcChatContext } from "../src/lib/ai/cc-advisor";
import { buildTrendStory } from "../src/lib/market/trend-story";
import type { OverviewModel } from "../src/lib/overview";
import type { UpsideAlert } from "../src/lib/alerts";
import {
  NIGHTLY_SNAPSHOT_WINDOW,
  snapshotSheetsForOwner,
} from "../src/lib/book-snapshot";
import { importCashDelta, tradeCashDelta } from "../src/lib/cash-delta";
import {
  cagr,
  finiteNumber,
  mean,
  roundMoney,
  safeDiv,
  sumMoney,
  weightedMean,
} from "../src/lib/money";
import { percent, signedPercent } from "../src/lib/format";
import { priorPriceFromChange, synthesizeSparkline } from "../src/lib/market/sparkline";
import { concentrationRead, themeBreakdown } from "../src/lib/allocation";
import { analyzePortfolioShock } from "../src/lib/book-shock";
import { enrichHoldings, buildSnapshot } from "../src/lib/calculations";
import { effectiveAnnualRate, calculateCompound } from "../src/lib/compound-interest";
import {
  allowClassAction,
  classifyHoldingWrite,
  classifyImportWrite,
  holdingWriteActions,
  parseClassPlan,
  parseStartingCash,
  realBookPortfolios,
  resolveClassroomTrade,
  startPeriodNow,
} from "../src/lib/classroom";
import {
  CLASS_TEMPLATES,
  formatCashDigits,
  parseCashDigits,
} from "../src/lib/class-templates";

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
  assert.equal(packed.length, 1);
  assert.equal(
    packed[0]?.head,
    "$NBIS · 40.5% → 35% · $CRWV · 36.8% → 32%"
  );
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

run("trim verdict that restates the size line is dropped", () => {
  assert.equal(
    verdictRepeatsTrim("Trim about 20% into the strength. Keep the rest.", 20),
    true
  );
  assert.equal(
    verdictRepeatsTrim("Trim about 20% so it isn't a third of the book.", 20),
    false
  );
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
  assert.equal(statusLabel("broken"), "Thesis broken");
  assert.equal(statusLabel("watch"), "Thesis watch");
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

run("humanize kills leftover market slang", () => {
  assert.equal(
    humanizeMargusText("The thesis is intact on the dip."),
    "The thesis is intact on the dip."
  );
  assert.match(
    humanizeMargusText("Add an AI power sleeve next to the compute names."),
    /electricity-for-AI names/i
  );
  assert.doesNotMatch(
    humanizeMargusText("A calmer sleeve next to it keeps one delay from being the whole year."),
    /\bsleeve\b/i
  );
  assert.doesNotMatch(
    humanizeMargusText("Tape read from the move and the book while the model was busy."),
    /\btape\b/i
  );
  assert.doesNotMatch(
    humanizeMargusText("Tape read from the move and the book while the model was busy."),
    /Couldn't get a full model|model was busy/i
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
  assert.match(site, /UPSIDE_CANONICAL_HOST/);
  assert.match(site, /safeInternalPath/);
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(layout, /PRODUCT_NAME/);
  const envEx = readFileSync(".env.example", "utf8");
  assert.match(envEx, /upsidelab\.app/);
  assert.doesNotMatch(envEx, /jwjezdgggrgdgfsovgtx/);
  const nextCfg = readFileSync("next.config.ts", "utf8");
  assert.match(nextCfg, /poweredByHeader: false/);
  assert.match(nextCfg, /X-Frame-Options/);
  const callback = readFileSync("src/app/auth/callback/route.ts", "utf8");
  assert.match(callback, /safeInternalPath/);
  const proxy = readFileSync("src/proxy.ts", "utf8");
  assert.match(proxy, /redirectTarget/);
});

run("canonical host strips www and rejects off-site next paths", () => {
  assert.equal(normalizeHostname("https://www.upsidelab.app/"), "www.upsidelab.app");
  assert.ok(isLegacyHost("www.upsidelab.app"));
  assert.ok(isLegacyHost("https://upside-upthink-solutions.vercel.app"));
  assert.ok(!isLegacyHost("upsidelab.app"));
  assert.equal(safeInternalPath("https://evil.example"), "/");
  assert.equal(safeInternalPath("//evil.example"), "/");
  assert.equal(safeInternalPath("/lab?tab=pulse"), "/lab?tab=pulse");
  assert.equal(safeInternalPath("lab"), "/");
});

run("set env values that are not https are rejected", () => {
  const issues = validateServerEnv({
    NEXT_PUBLIC_SUPABASE_URL: "http://insecure.example",
    UPSIDE_CANONICAL_HOST: "not a host",
  });
  assert.ok(issues.some((i) => i.key === "NEXT_PUBLIC_SUPABASE_URL"));
  assert.ok(issues.some((i) => i.key === "UPSIDE_CANONICAL_HOST"));
  assert.equal(
    validateServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://uzrnybyggznpvgxgrvgl.supabase.co",
    }).length,
    0
  );
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

run("UI type stays on the five-size scale", () => {
  const offenders = sources
    .filter(({ file, src }) => {
      if (file.endsWith("UpsideLogo.tsx") || file.endsWith("ui/Panel.tsx")) {
        return false;
      }
      return (
        /text-\[(?:\d|\.)+[^\]]*\]/.test(src) ||
        /text-(?:3xl|4xl|5xl)/.test(src) ||
        /sm:text-(?:xl|2xl|3xl)/.test(src)
      );
    })
    .map(({ file }) => file);
  assert.deepEqual(
    [...new Set(offenders)],
    [],
    `use text-xs/sm/base/lg/2xl only. Offenders: ${offenders.join(", ")}`
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

run("movers are compact tiles, not a stretched table or sparkline", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/OverviewDashboard.tsx"),
    "utf8"
  );
  const row = src.slice(
    src.indexOf("function MoverTile"),
    src.indexOf("function PortfolioLane")
  );
  assert.doesNotMatch(row, /Sparkline/);
  assert.doesNotMatch(src, /MOVER_GRID/);
  assert.match(row, /percent\(pct/);
  assert.match(row, /signedCurrency\(dollars\)/);
  assert.match(src, /sm:grid-cols-2/);
  assert.doesNotMatch(row, /label="Price"/);
  assert.doesNotMatch(row, />Recent</);
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

run("weakening trend names the 40-week average and the slope", () => {
  const story = buildTrendStory({
    ticker: "RDDT",
    regime: "weakening",
    aboveLongMa: true,
    rsi: 62,
    macdBuilding: true,
    divergence: null,
    rs13: 0.04,
    rs26: 0.08,
    chg2w: 0.266,
    chg4w: 0.31,
    lastClose: 45.2,
    longMa: 43.84,
    vsLongMaPct: 45.2 / 43.84 - 1,
    longSlopePct: -0.012,
    macdHistogram: 0.18,
    macdHistogramPrev: 0.24,
  });
  const trend = story.signals.find((s) => s.key === "trend");
  assert.ok(trend);
  assert.equal(trend!.value, "Weakening");
  assert.match(trend!.detail, /40-week average/);
  assert.match(trend!.detail, /falling/);
  assert.match(trend!.detail, /8 weeks/);
  assert.match(trend!.detail, /45\.20|\$45/);
});

run("signed-in pages share one column so rooms do not jump", () => {
  const pages = [
    "Dashboard.tsx",
    "CommunitiesList.tsx",
    "CommunityView.tsx",
    "UpsidePortfolioPage.tsx",
    "AccountPage.tsx",
    "AdminPage.tsx",
    "AppHeader.tsx",
    "BookBottomNav.tsx",
    "PortfolioTabs.tsx",
  ];
  for (const name of pages) {
    const src = readFileSync(join(process.cwd(), "src/components", name), "utf8");
    assert.match(src, /PAGE_(MAIN|COLUMN|FRAME)_CLASS/, name);
    assert.doesNotMatch(src, /max-w-3xl|max-w-4xl|max-w-6xl/, name);
  }
  const shell = readFileSync(
    join(process.cwd(), "src/lib/page-shell.ts"),
    "utf8"
  );
  assert.match(shell, /max-w-\[1400px\]/);
  assert.match(shell, /w-full/);
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
  assert.match(product, /See what your book did/);
  const gate = readFileSync(
    join(process.cwd(), "src/components/SignInGate.tsx"),
    "utf8"
  );
  assert.match(gate, /PRODUCT_SENTENCE/);
  assert.match(gate, /SIGNIN_WHO/);
  assert.match(gate, /SIGNIN_POINTS/);
  assert.match(gate, /Sample/);
  assert.doesNotMatch(gate, /\$50k|AI manage/);
  assert.doesNotMatch(gate, /h-2\.5 w-10 rounded-sm bg-zinc-700/);
  assert.doesNotMatch(gate, /Communities stay read-only/);
  assert.match(gate, /inviteLandingCopy/);
});

run("community invite landing names the circle", () => {
  assert.deepEqual(inviteFromLocation("/communities/join", "?token=abc"), {
    kind: "community",
    name: null,
  });
  assert.equal(inviteFromLocation("/", "?token=abc"), null);
  assert.equal(
    inviteLandingCopy({ kind: "community", name: null }).title,
    "You've been invited to join a community."
  );
  assert.equal(
    inviteLandingCopy({ kind: "community", name: "Upside Circle" }).title,
    "You've been invited to join Upside Circle."
  );
  assert.equal(
    inviteLandingCopy({ kind: "classroom", name: null }).title,
    "You've been invited to a class."
  );
  assert.match(
    readFileSync(join(process.cwd(), "src/app/api/communities/join/route.ts"), "utf8"),
    /export async function GET/
  );
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
    overview.indexOf("function HomeSheetChip")
  );
  assert.doesNotMatch(emptyFn, /HomeWorld/);
  assert.match(emptyFn, /browse circles/);
  assert.match(emptyFn, /homework sheet/);
  assert.match(emptyFn, /Do not paste a real book/);
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
  assert.doesNotMatch(panel, /SPY/);
  assert.match(panel, /Drag across to read a year/);
  assert.doesNotMatch(route, /requestedStance/);
  assert.doesNotMatch(route, /body\.stance/);
  assert.doesNotMatch(plan, /STANCE = BEARISH/);
  assert.doesNotMatch(plan, /STANCE = BULLISH/);
});

run("Forecast does not call the model when a path is already saved", () => {
  const saved = {
    eoyTargets: [{ ticker: "NBIS", prices: { 2026: 1 } }],
  } as Parameters<typeof shouldAutoRefreshForecast>[0]["plan"];
  assert.equal(
    shouldAutoRefreshForecast({
      plan: saved,
      tickers: ["NBIS"],
      fullyCovered: false,
      cachedTickers: [],
    }).run,
    false
  );
  assert.equal(
    shouldAutoRefreshForecast({
      plan: null,
      tickers: ["NBIS"],
      fullyCovered: false,
      cachedTickers: ["NBIS"],
    }).run,
    false
  );
  assert.equal(
    shouldAutoRefreshForecast({
      plan: null,
      tickers: ["NBIS"],
      fullyCovered: true,
    }).run,
    false
  );
  assert.equal(
    shouldAutoRefreshForecast({
      plan: null,
      tickers: ["NBIS"],
      fullyCovered: false,
      cachedTickers: [],
    }).reason,
    "first-run"
  );
  assert.equal(
    shouldAutoRefreshForecast({
      plan: saved,
      tickers: ["NBIS", "CRWV"],
      fullyCovered: false,
      cachedTickers: ["NBIS"],
    }).reason,
    "new-holding"
  );
});

run("chat does not ping the model before the first token", () => {
  const model = readFileSync(join(process.cwd(), "src/lib/ai/model.ts"), "utf8");
  const chat = readFileSync(
    join(process.cwd(), "src/app/api/chat/route.ts"),
    "utf8"
  );
  assert.doesNotMatch(model, /prompt:\s*"ping"/);
  assert.match(model, /rememberStreamingProvider/);
  assert.match(chat, /markChatActive/);
  assert.match(chat, /rememberStreamingProvider/);
  assert.match(chat, /speaking:\s*true/);
  assert.match(chat, /reasoningEffort:\s*"low"/);
  assert.match(model, /GROQ_CHAT_MODEL/);
  assert.match(model, /openai\/gpt-oss-20b/);
  assert.match(model, /STRUCTURED_PROVIDER_OPTIONS/);
  assert.match(
    readFileSync(join(process.cwd(), "src/app/api/forecast/plan/route.ts"), "utf8"),
    /STRUCTURED_PROVIDER_OPTIONS/
  );
  assert.doesNotMatch(
    readFileSync(join(process.cwd(), "src/app/api/forecast/plan/route.ts"), "utf8"),
    /effort:\s*"high"/
  );
});

run("Pulse Breaks-if hides the copy-paste kill switch", () => {
  const boilerplate =
    "This breaks if the reason you own it disappears. Lost the customer, a restatement, or guidance that kills the multi-year case. A quiet day is not that.";
  assert.equal(isGenericThesisBreak(boilerplate), true);
  assert.equal(
    isGenericThesisBreak(
      "the reason you own it disappears. Lost the customer, a restatement, or guidance that kills the multi-year case. A quiet day is not that."
    ),
    true
  );
  assert.equal(cleanThesisBreak(boilerplate), "");
  assert.equal(cleanThesisBreak(""), "");
  assert.equal(
    cleanThesisBreak(
      "Data-center bookings stall for two quarters and the big cloud contracts slip."
    ),
    "Data-center bookings stall for two quarters and the big cloud contracts slip."
  );
  const next = reconcilePulseCheck(check({ thesisBreak: boilerplate }));
  assert.equal(next.thesisBreak, "");
});

run("Pulse scan sits in its own card, not under the mood line", () => {
  const page = readFileSync(
    join(process.cwd(), "src/components/PulsePage.tsx"),
    "utf8"
  );
  const schema = readFileSync(
    join(process.cwd(), "src/lib/thesis-pulse-schema.ts"),
    "utf8"
  );
  assert.match(page, /Today&apos;s scan/);
  assert.match(page, /<Card>/);
  assert.doesNotMatch(
    page,
    /skippedTickers\.length > 0[\s\S]{0,400}humanizeMargusText\(summary\)/
  );
  assert.doesNotMatch(schema, /lead with any sharp drops/);
});

run("Pulse puts hold-exits and 5% movers on top", () => {
  assert.equal(isBigPulseMove(0.05), true);
  assert.equal(isBigPulseMove(-0.05), true);
  assert.equal(isBigPulseMove(0.049), false);
  assert.equal(isBigPulseMove(null), false);

  const now = Date.parse("2026-08-15T12:00:00Z");
  assert.equal(
    pulseLeftHold(
      "add",
      [
        { action: "hold", at: "2026-08-14T10:00:00Z" },
        { action: "add", at: "2026-08-15T10:00:00Z" },
      ],
      now
    ),
    true
  );
  assert.equal(
    pulseLeftHold(
      "add",
      [
        { action: "hold", at: "2026-08-13T10:00:00Z" },
        { action: "add", at: "2026-08-13T11:00:00Z" },
      ],
      now
    ),
    false
  );
  assert.equal(
    pulseLeftHold("hold", [{ action: "hold", at: "2026-08-15T10:00:00Z" }], now),
    false
  );
  assert.equal(
    pulseLeftHold(
      "trim",
      [
        { action: "hold", at: "2026-08-14T10:00:00Z" },
        { action: "add", at: "2026-08-15T09:00:00Z" },
        { action: "trim", at: "2026-08-15T10:00:00Z" },
      ],
      now
    ),
    false
  );

  const ranked = sortPulseCandidates(
    [
      { ticker: "QUIET", effectivePct: 0.01, bookPct: 0.4, currentValue: 400 },
      { ticker: "UP", effectivePct: 0.08, bookPct: 0.05, currentValue: 50 },
      { ticker: "DOWN", effectivePct: -0.06, bookPct: 0.05, currentValue: 50 },
      { ticker: "LEFT", effectivePct: 0.01, bookPct: 0.1, currentValue: 100 },
    ],
    { leftHoldTickers: new Set(["LEFT"]) }
  );
  assert.deepEqual(
    ranked.map((r) => r.ticker),
    ["LEFT", "UP", "DOWN", "QUIET"]
  );

  const movers = sortPulseCandidates([
    { ticker: "A", effectivePct: 0.06, bookPct: 0.5 },
    { ticker: "B", effectivePct: -0.11, bookPct: 0.1 },
    { ticker: "C", effectivePct: 0.09, bookPct: 0.2 },
  ]);
  assert.deepEqual(
    movers.map((r) => r.ticker),
    ["B", "C", "A"]
  );
});

run("Pulse does not hourly-refresh the model", () => {
  const page = readFileSync(
    join(process.cwd(), "src/components/PulsePage.tsx"),
    "utf8"
  );
  assert.doesNotMatch(page, /setInterval\(\(\) => \{[\s\S]*runPulse/);
  assert.match(page, /shouldAutoPulseTicker/);
  assert.equal(
    shouldAutoPulseTicker({ needsAttention: false, cachedAt: "2026-08-15T00:00:00Z" }),
    false
  );
  assert.equal(shouldAutoPulseTicker({ needsAttention: true }), true);
  assert.equal(shouldAutoPulseTicker({ needsAttention: false }), true);
});

run("background Margus waits while chat is live", () => {
  markChatActive(0);
  endBackgroundLlm();
  endBackgroundLlm();
  markChatActive(5_000);
  assert.equal(chatIsBusy(), true);
  assert.equal(beginBackgroundLlm(), false);
  markChatActive(0);
  assert.equal(chatIsBusy(), false);
  assert.equal(beginBackgroundLlm(), true);
  assert.equal(beginBackgroundLlm(), false);
  endBackgroundLlm();
});

run("Daily Duel paints the last pick before the network returns", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/DailyDuelCard.tsx"),
    "utf8"
  );
  assert.match(src, /loadCommunityDuelCache/);
  assert.match(src, /saveCommunityDuelCache/);
  assert.match(src, /useHydratedCache/);
  assert.match(src, /useLayoutEffect/);
});

run("Communities list does not blank a cached circle while it refreshes", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/CommunitiesList.tsx"),
    "utf8"
  );
  assert.doesNotMatch(src, /hadCache = communities\.length/);
  assert.match(src, /loadCommunityListCache/);
  assert.match(src, /communities\.length === 0 && loading/);
  assert.match(src, /Discover public circles/);
  assert.match(src, /No public circles right now/);
  assert.doesNotMatch(src, /discover\.length > 0 &&/);
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

run("onboarding asks for weekday and Sunday notes", () => {
  const onboarding = readFileSync(
    join(process.cwd(), "src/components/ExperienceOnboardingModal.tsx"),
    "utf8"
  );
  assert.match(onboarding, /Want a report in your inbox/);
  assert.match(onboarding, /noteMorning/);
  assert.match(onboarding, /noteSunday, setNoteSunday\] = useState\(true\)/);
  assert.match(onboarding, /Sunday is on/);
  assert.match(onboarding, /\{step\}\/4/);
});

run("popular ticker snapshot is 30 names, one month at a time", () => {
  assert.equal(FALLBACK_POPULAR_TICKERS.length, POPULAR_TICKER_COUNT);
  assert.equal(sanitizePopularTickers(["nvda", "NVDA", "bad!", "AAPL"]).length, 30);
  assert.deepEqual(sanitizePopularTickers(["nvda", "AAPL"]).slice(0, 2), [
    "NVDA",
    "AAPL",
  ]);
  assert.match(currentPopularMonth(new Date("2026-08-15T12:00:00Z")), /^2026-08$/);
});

run("earnings dates use the call when it already happened", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const crwv = resolveYahooEarnings(
    {
      history: [{ period: "-1q", quarter: "2026-03-31T00:00:00.000Z" }],
      earningsDates: ["2026-11-11T12:00:00.000Z"],
      earningsCallDates: ["2026-08-11T12:00:00.000Z"],
      nextIsEstimate: true,
    },
    now
  );
  assert.equal(crwv.lastKey, "2026-08-11");
  assert.equal(crwv.nextKey, "2026-11-11");
  assert.equal(crwv.nextIsEstimate, true);
  const nvda = resolveYahooEarnings(
    {
      history: [{ period: "-1q", quarter: "2026-04-30T00:00:00.000Z" }],
      earningsDates: ["2026-08-26T12:00:00.000Z"],
      earningsCallDates: ["2026-08-26T12:00:00.000Z"],
      nextIsEstimate: false,
    },
    now
  );
  assert.equal(nvda.nextKey, "2026-08-26");
  assert.ok((nvda.daysUntilNext ?? 0) > 7);
  const block = formatEarningsCalendarBlock([
    {
      ticker: "CRWV",
      lastDate: "2026-08-11",
      daysSinceLast: 4,
      nextDate: "2026-11-11",
      daysUntilNext: 88,
      nextIsEstimate: true,
    },
  ]);
  assert.match(block, /Do not invent/);
  assert.match(block, /\$CRWV/);
  assert.match(block, /2026-08-11/);
  const prompt = buildCcSystemPrompt({
    portfolioName: "Test",
    cashBalance: 0,
    holdings: [],
    rows: [],
    totals: {
      cost: 0,
      value: 0,
      roiPct: 0,
      roiDollar: 0,
      yield2wAvg: 0,
      premiumTotal: 0,
    },
    otherPortfolios: [],
    earnings: [
      {
        ticker: "NVDA",
        lastDate: null,
        daysSinceLast: null,
        nextDate: "2026-08-26",
        daysUntilNext: 11,
      },
    ],
  } as CcChatContext);
  assert.match(prompt, /Do not invent/);
  assert.match(prompt, /\$NVDA/);
  assert.match(prompt, /2026-08-26/);
});

run("watchlist look is a range read, not a made-up target", () => {
  const low = watchLook({
    price: 102,
    changePercent: -0.01,
    sparkline: [100, 118, 116, 114, 112, 110, 108, 106, 104, 103],
  });
  assert.equal(low.kind, "look");
  assert.match(low.headline, /recent low/i);
  const high = watchLook({
    price: 117,
    changePercent: 0.01,
    sparkline: [100, 102, 104, 106, 108, 110, 112, 114, 116, 117],
  });
  assert.equal(high.kind, "wait");
  assert.match(high.headline, /recent high/i);
  const report = watchLook(
    {
      price: 110,
      changePercent: 0,
      sparkline: [100, 102, 104, 106, 108, 110],
    },
    3
  );
  assert.equal(report.kind, "report");
  assert.match(report.headline, /3 days/);
  const strip = readFileSync(
    join(process.cwd(), "src/components/WatchlistStrip.tsx"),
    "utf8"
  );
  assert.match(strip, /watchLook/);
  assert.match(strip, /Check in Pulse/);
});

run("watchlist typeahead matches names as you type", () => {
  const local = localTickerSuggestions(
    "GOO",
    ["GOOGL", "GOOG", "MSFT"],
    new Set()
  );
  assert.deepEqual(
    local.map((r) => r.symbol),
    ["GOOGL", "GOOG"]
  );
  const merged = mergeTickerSuggestions(
    local,
    [{ symbol: "GOOGL", name: "Alphabet Inc." }],
    new Set(["MSFT"])
  );
  assert.equal(merged[0]?.symbol, "GOOGL");
  assert.equal(merged[0]?.name, "Alphabet Inc.");
  const strip = readFileSync(
    join(process.cwd(), "src/components/WatchlistStrip.tsx"),
    "utf8"
  );
  assert.match(strip, /\/api\/market\/search/);
});

run("onboarding lets you pick this month's popular names", () => {
  const onboarding = readFileSync(
    join(process.cwd(), "src/components/ExperienceOnboardingModal.tsx"),
    "utf8"
  );
  const cron = readFileSync(
    join(process.cwd(), "src/app/api/cron/popular-tickers/route.ts"),
    "utf8"
  );
  const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
  assert.match(onboarding, /Any names you want to keep an eye on/);
  assert.match(onboarding, /saveWatchlist/);
  assert.match(cron, /refreshPopularTickers/);
  assert.match(vercel, /\/api\/cron\/popular-tickers/);
  assert.match(vercel, /0 7 1 \* \*/);
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
  const pulseApi = readFileSync(
    join(process.cwd(), "src/app/api/thesis/pulse/route.ts"),
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
  assert.doesNotMatch(pulse, /Check all again/);
  assert.doesNotMatch(pulse, /Write why you own/);
  assert.doesNotMatch(pulse, /Pulling news/);
  assert.doesNotMatch(pulse, /Couldn't get a full model/);
  assert.doesNotMatch(pulse, /The model was busy/);
  assert.doesNotMatch(pulse, /buildFallbackPulseCheck/);
  assert.doesNotMatch(pulseApi, /Couldn't get a full model/);
  assert.doesNotMatch(pulseApi, /The model was busy/);
  assert.doesNotMatch(pulseApi, /Couldn't reach the model/);
  assert.match(pulseApi, /reuseCachedPulse/);
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

run("assumed YTD NAV uses current size and forward-fills gaps", () => {
  const points = reconstructAssumedNav(
    1000,
    [
      { ticker: "AAA", shares: 10 },
      { ticker: "BBB", shares: 2 },
    ],
    {
      AAA: [
        { date: "2026-01-02", close: 10 },
        { date: "2026-01-05", close: 12 },
      ],
      BBB: [{ date: "2026-01-05", close: 50 }],
    }
  );
  assert.equal(points.length, 2);
  // Jan 2: cash 1000 + 10*10 + 2*0 (BBB not listed yet)
  assert.equal(points[0]!.nav, 1100);
  // Jan 5: cash 1000 + 10*12 + 2*50
  assert.equal(points[1]!.nav, 1220);
  const weeks = downsampleToWeeks(points);
  assert.ok(weeks.length >= 1);
  assert.equal(weeks[weeks.length - 1]!.nav, 1220);
});

run("year chart never stitches a live total onto another book's path", () => {
  const hist = [
    { date: "2026-01-02", nav: 400_000 },
    { date: "2026-01-03", nav: 620_000 },
    { date: "2026-01-04", nav: 780_000 },
  ];
  assert.deepEqual(
    paintBookNavSeries({
      hist,
      histBelongsToBook: false,
      liveNav: 210_000,
    }),
    []
  );
  const painted = paintBookNavSeries({
    hist,
    histBelongsToBook: true,
    liveNav: 790_000,
  });
  assert.equal(painted[painted.length - 1]!.nav, 790_000);
  assert.equal(painted[painted.length - 1]!.date, "Live");
});

run("year chart never paints a zero or empty live tip", () => {
  const hist = [
    { date: "2026-01-02", nav: 400_000 },
    { date: "2026-01-03", nav: 620_000 },
    { date: "2026-01-04", nav: 0 },
  ];
  const noLive = paintBookNavSeries({
    hist,
    histBelongsToBook: true,
    liveNav: 0,
  });
  assert.equal(noLive.length, 2);
  assert.equal(noLive[noLive.length - 1]!.nav, 620_000);
  const withLive = paintBookNavSeries({
    hist,
    histBelongsToBook: true,
    liveNav: 790_000,
  });
  assert.equal(withLive[withLive.length - 1]!.nav, 790_000);
  assert.ok(withLive.every((p) => p.nav > 0));
});

run("YTD anchor keeps the assumed shape and pins the year size", () => {
  const start = startNavFromYtdPct(120, 0.2);
  assert.equal(start, 100);
  const scaled = applyYtdAnchor(
    [
      { date: "2026-01-02", nav: 200 },
      { date: "2026-01-03", nav: 250 },
      { date: "2026-01-04", nav: 300 },
    ],
    100,
    150
  );
  assert.equal(scaled[0]!.nav, 100);
  assert.equal(scaled[1]!.nav, 125);
  assert.equal(scaled[2]!.nav, 150);
});

run("empty class plan is anything goes", () => {
  const trade = resolveClassroomTrade(
    parseClassPlan({}),
    new Date("2026-08-15T12:00:00Z")
  );
  assert.equal(trade.kind, "open");
  assert.equal(trade.canBuy, true);
  assert.equal(trade.canSell, true);
  assert.equal(trade.studentLocked, false);
});

run("class starting cash shows thousands separators", () => {
  assert.equal(formatCashDigits(100_000), "100,000");
  assert.equal(parseCashDigits("$100,000"), 100_000);
  assert.equal(parseStartingCash("100,000"), 100_000);
  assert.equal(parseStartingCash("$1,000,000"), 1_000_000);
});

run("class templates cover the usual teacher setups", () => {
  assert.ok(CLASS_TEMPLATES.length >= 6);
  const ids = new Set(CLASS_TEMPLATES.map((t) => t.id));
  assert.equal(ids.size, CLASS_TEMPLATES.length);
  for (const t of CLASS_TEMPLATES) {
    assert.ok(t.title.trim());
    assert.ok(t.blurb.trim());
    assert.ok(t.assignment.trim());
    assert.doesNotMatch(t.assignment, /—/);
    assert.doesNotMatch(t.blurb, /thesis|NAV|sleeve/i);
    assert.ok(t.cash >= 10_000 && t.cash <= 1_000_000);
  }
});

run("buy week blocks sell", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const plan = parseClassPlan(
    {
      periods: [
        {
          id: "a",
          kind: "buy",
          startsAt: "2026-08-10T00:00:00Z",
          endsAt: "2026-08-20T00:00:00Z",
        },
      ],
    },
    now
  );
  const trade = resolveClassroomTrade(plan, now);
  assert.equal(trade.kind, "buy");
  assert.equal(trade.canBuy, true);
  assert.equal(trade.canSell, false);
  assert.equal(trade.canAdjust, true);
  assert.equal(allowClassAction(trade, "sell"), false);
});

run("startPeriodNow ends the live stretch", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const plan = parseClassPlan(
    {
      periods: [
        {
          id: "a",
          kind: "buy",
          startsAt: "2026-08-10T00:00:00Z",
          endsAt: null,
        },
      ],
    },
    now
  );
  const next = startPeriodNow(plan, "closed", now);
  const trade = resolveClassroomTrade(
    next,
    new Date("2026-08-15T12:00:01Z")
  );
  assert.equal(trade.kind, "closed");
  assert.equal(trade.canBuy, false);
  assert.equal(trade.canCash, false);
});

run("startPeriodNow is a no-op when that rule is already on", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const plan = parseClassPlan(
    {
      periods: [
        {
          id: "a",
          kind: "buy",
          startsAt: "2026-08-10T00:00:00Z",
          endsAt: null,
        },
      ],
    },
    now
  );
  const next = startPeriodNow(plan, "buy", now);
  assert.equal(next.periods.length, 1);
  assert.equal(next.periods[0]!.id, "a");
});

run("parseClassPlan drops stretches that already ended", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const plan = parseClassPlan(
    {
      periods: [
        {
          id: "old",
          kind: "buy",
          startsAt: "2026-08-01T00:00:00Z",
          endsAt: "2026-08-10T00:00:00Z",
        },
        {
          id: "live",
          kind: "closed",
          startsAt: "2026-08-10T00:00:00Z",
          endsAt: null,
        },
      ],
    },
    now
  );
  assert.equal(plan.periods.length, 1);
  assert.equal(plan.periods[0]!.id, "live");
});

run("latest overlapping stretch wins", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const plan = parseClassPlan(
    {
      periods: [
        {
          id: "a",
          kind: "buy",
          startsAt: "2026-08-01T00:00:00Z",
          endsAt: "2026-08-30T00:00:00Z",
        },
        {
          id: "b",
          kind: "fix",
          startsAt: "2026-08-14T00:00:00Z",
          endsAt: "2026-08-16T00:00:00Z",
        },
      ],
    },
    now
  );
  const trade = resolveClassroomTrade(plan, now);
  assert.equal(trade.kind, "fix");
  assert.equal(trade.canSell, true);
  assert.equal(trade.canBuy, false);
});

run("holding write classify buy sell adjust", () => {
  assert.equal(
    classifyHoldingWrite({ isNew: true, isDelete: false }),
    "buy"
  );
  assert.equal(
    classifyHoldingWrite({ isNew: false, isDelete: true }),
    "sell"
  );
  assert.equal(
    classifyHoldingWrite({
      isNew: false,
      isDelete: false,
      existingShares: 10,
      nextShares: 12,
    }),
    "buy"
  );
  assert.equal(
    classifyHoldingWrite({
      isNew: false,
      isDelete: false,
      existingShares: 10,
      nextShares: 8,
    }),
    "sell"
  );
  assert.equal(
    classifyHoldingWrite({
      isNew: false,
      isDelete: false,
      existingShares: 10,
      nextShares: 10,
    }),
    "adjust"
  );
  assert.deepEqual(
    holdingWriteActions({
      isNew: false,
      isDelete: false,
      tickerChanged: true,
    }),
    ["buy", "sell"]
  );
});

run("class sheets stay out of the real book", () => {
  assert.deepEqual(
    realBookPortfolios([
      { id: "real", classroom_community_id: null },
      { id: "hw", classroom_community_id: "class-1" },
    ]).map((p) => p.id),
    ["real"]
  );
  assert.deepEqual(
    realBookPortfolios([{ id: "hw", classroom_community_id: "class-1" }]).map(
      (p) => p.id
    ),
    ["hw"]
  );
});

run("inbox notes say Thesis intact to a person", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/note-report.ts"),
    "utf8"
  );
  assert.match(src, /Thesis intact/);
  assert.doesNotMatch(src, /Last Pulse:/);
  assert.match(src, /humanPulseStatus/);
});

run("full-book restore only touches sheets you own", () => {
  const ids = snapshotSheetsForOwner(
    {
      portfolios: [
        { id: "mine-a" },
        { id: "theirs" },
        { id: "mine-b" },
        { name: "no-id" },
      ],
      holdings: [],
    },
    ["mine-a", "mine-b", "ghost"]
  );
  assert.deepEqual(ids, ["mine-a", "mine-b"]);
});

run("buying a name spends cash and selling adds it back", () => {
  assert.equal(tradeCashDelta({ buyShares: 10, buyPrice: 20 }), -200);
  assert.equal(tradeCashDelta({ sellShares: 10, sellPrice: 25 }), 250);
  assert.equal(
    tradeCashDelta({
      sellShares: 5,
      sellPrice: 10,
      buyShares: 2,
      buyPrice: 8,
    }),
    34
  );
  assert.equal(
    importCashDelta(
      [{ ticker: "AAPL", shares: 10, buy_price: 100 }],
      [{ ticker: "AAPL", shares: 12, buy_price: 110 }],
      false,
      {}
    ),
    -220
  );
  assert.equal(
    importCashDelta(
      [{ ticker: "AAPL", shares: 10, buy_price: 100 }],
      [{ ticker: "AAPL", shares: 4, buy_price: 100 }],
      false,
      { AAPL: 90 }
    ),
    540
  );
  assert.equal(
    importCashDelta(
      [
        { ticker: "AAPL", shares: 10, buy_price: 100 },
        { ticker: "MSFT", shares: 2, buy_price: 400 },
      ],
      [{ ticker: "AAPL", shares: 10, buy_price: 100 }],
      true,
      { MSFT: 410 }
    ),
    820
  );
});

run("saves list hides nightly rows", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/api/snapshots/route.ts"),
    "utf8"
  );
  assert.match(src, /neq\("kind", "nightly"\)/);
  assert.match(src, /kind === "nightly"/);
});

run("fun facts and circle facts do not say NAV or dry powder", () => {
  const facts = readFileSync(join(process.cwd(), "src/lib/fun-facts.ts"), "utf8");
  const circle = readFileSync(
    join(process.cwd(), "src/lib/community-fun-facts.ts"),
    "utf8"
  );
  const compound = readFileSync(
    join(process.cwd(), "src/lib/compound-play.ts"),
    "utf8"
  );
  const personality = readFileSync(
    join(process.cwd(), "src/lib/portfolio-personality.ts"),
    "utf8"
  );
  const league = readFileSync(
    join(process.cwd(), "src/components/CommunityView.tsx"),
    "utf8"
  );
  assert.doesNotMatch(facts, /dry powder/i);
  assert.doesNotMatch(facts, /\bNAV\b/);
  assert.doesNotMatch(circle, /dry-powder stash|dry powder/i);
  assert.doesNotMatch(circle, /Circle NAV/);
  assert.doesNotMatch(circle, /live mark/i);
  assert.doesNotMatch(circle, /risk-taker|Risk Taker/i);
  assert.doesNotMatch(personality, /volatile treasure/i);
  assert.doesNotMatch(league, /The Risk Taker/);
  assert.doesNotMatch(compound, /thesis breaks/);
  assert.doesNotMatch(compound, /index-ish beta/);
  assert.doesNotMatch(compound, /long-only beta/);
});

run("Fund page labels Margus's note Thesis", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/UpsidePortfolioPage.tsx"),
    "utf8"
  );
  assert.match(src, /label="Thesis"/);
});

run("prompts do not teach the model trader words as working vocab", () => {
  const persona = readFileSync(
    join(process.cwd(), "src/lib/ai/margus-persona.ts"),
    "utf8"
  );
  const forecast = readFileSync(
    join(process.cwd(), "src/lib/forecast-plan.ts"),
    "utf8"
  );
  const pulse = readFileSync(
    join(process.cwd(), "src/app/api/thesis/pulse/route.ts"),
    "utf8"
  );
  const notes = readFileSync(
    join(process.cwd(), "src/lib/note-margus.ts"),
    "utf8"
  );
  const fund = readFileSync(
    join(process.cwd(), "src/lib/margus-fund.ts"),
    "utf8"
  );
  assert.doesNotMatch(persona, /high-conviction, forward-looking/);
  assert.doesNotMatch(persona, /liquidity expansion, risk-on/);
  assert.doesNotMatch(forecast, /OWNER CONVICTION/);
  assert.doesNotMatch(forecast, /owner's thesis/);
  assert.doesNotMatch(pulse, /Owner thesis:/);
  assert.doesNotMatch(pulse, /Tape read/);
  assert.doesNotMatch(notes, /Owner thesis:/);
  assert.doesNotMatch(fund, /Original thesis:/);
  assert.doesNotMatch(fund, /fundamentals-based thesis/);
  const chat = readFileSync(
    join(process.cwd(), "src/components/CcAdvisorChat.tsx"),
    "utf8"
  );
  assert.doesNotMatch(chat, /not OTM/);
});

run("import classify treats default replace as a sell", () => {
  const actions = classifyImportWrite({
    cash: false,
    replace: true,
    rows: [{ ticker: "AAPL", shares: 5 }],
    existing: [
      { ticker: "AAPL", shares: 10 },
      { ticker: "MSFT", shares: 2 },
    ],
  });
  assert.ok(actions.includes("sell"));
  assert.ok(!actions.includes("buy"));
});

run("money rounds the same distance either side of zero", () => {
  // roundMoney used to add Number.EPSILON before scaling, which does nothing
  // above ~1, and leaned on Math.round, which breaks ties toward +Infinity.
  // So 8.165 rounded down to 8.16 and -1.005 rounded to -1 while 1.005
  // rounded to 1.01. Sheets carry negative cash, so a buy and the sell that
  // undoes it have to cancel exactly.
  for (const v of [1.005, 2.675, 8.165, 0.005, 1234.565]) {
    assert.equal(
      roundMoney(-v),
      -roundMoney(v),
      `${v} rounds differently below zero`
    );
  }
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(8.165), 8.17);
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  // -0 serialises as "-0" and fails Object.is against 0, so a balance that
  // rounded to nothing would look like a change to anything diffing it.
  assert.ok(Object.is(roundMoney(-0.001), 0), "rounds to negative zero");
  // Junk in, zero out: NaN and Infinity are not amounts of money.
  assert.equal(roundMoney(Number.NaN), 0);
  assert.equal(roundMoney(Number.POSITIVE_INFINITY), 0);
  // Real but past the point where a double can hold cents, so it clamps
  // instead of returning a number nobody can reason about.
  assert.equal(roundMoney(1e18), Number.MAX_SAFE_INTEGER / 100);
  assert.equal(roundMoney(-1e18), -Number.MAX_SAFE_INTEGER / 100);
});

run("safeDiv and sumMoney never emit NaN or drift", () => {
  assert.equal(safeDiv(1, 0), 0);
  assert.equal(safeDiv(0, 0), 0);
  assert.equal(safeDiv(Number.NaN, 2), 0);
  assert.equal(safeDiv(1, Number.NaN), 0);
  assert.equal(sumMoney([0.1, 0.2, 0.3]), 0.6);
  assert.equal(sumMoney([0.01, Number.NaN, 0.02]), 0.03);
  // A long column of thirds must not accumulate a stray fraction of a cent.
  assert.equal(sumMoney(Array(300).fill(0.01)), 3);
});

run("a round trip through cash leaves the balance where it started", () => {
  // The regression this guards: asymmetric rounding meant buy-then-sell at the
  // same price could leave a stray cent behind in cash.
  for (const [shares, price] of [
    [3, 2.675],
    [7, 8.165],
    [11, 1.005],
    [1, 0.005],
  ] as [number, number][]) {
    const out = tradeCashDelta({ buyShares: shares, buyPrice: price });
    const back = tradeCashDelta({ sellShares: shares, sellPrice: price });
    assert.equal(out + back, 0, `${shares} @ ${price} did not net to zero`);
  }
  assert.equal(tradeCashDelta({ buyShares: Number.NaN, buyPrice: 10 }), 0);
});

run("zero-balance books and junk inputs never emit NaN or Infinity", () => {
  assert.equal(finiteNumber(Number.NaN), 0);
  assert.equal(finiteNumber(Number.POSITIVE_INFINITY, 7), 7);
  assert.equal(mean([Number.NaN, Number.POSITIVE_INFINITY]), 0);
  assert.equal(weightedMean([{ value: 0.1, weight: 0 }]), null);
  assert.equal(cagr(0, 200, 5), null);
  assert.equal(cagr(100, 200, 0), null);
  assert.ok(cagr(100, 200, 1) !== null);
  assert.equal(cagr(100, 200, 1), 1);

  const empty = todayDollarFor(0, 0.02);
  assert.equal(empty.dollar, 0);
  assert.ok(Number.isFinite(empty.dollar));
  const wiped = todayDollarFor(100, -1);
  assert.equal(wiped.dollar, 0);
  assert.equal(wiped.pct, -1);
  const junk = todayDollarFor(Number.NaN, Number.POSITIVE_INFINITY);
  assert.equal(junk.dollar, 0);
  assert.equal(junk.pct, null);

  const rows = enrichHoldings(
    [
      {
        id: "h1",
        portfolio_id: "p1",
        ticker: "AAA",
        shares: 10,
        buy_price: 0,
        eoy_target: null,
        target_call_pct: 0.14,
        stock_target_override: null,
        sort_order: 0,
      },
    ],
    { AAA: { ticker: "AAA", price: 5, change: 0, changePercent: 0, previousClose: 5, sparkline: [], marketState: null, preMarketPrice: null, preMarketChange: null, preMarketChangePercent: null, postMarketPrice: null, postMarketChange: null, postMarketChangePercent: null } },
    Number.NaN
  );
  assert.ok(rows.every((h) => Number.isFinite(h.pctOfTotal)));
  assert.equal(rows[0]!.roiPct, 0);

  const snap = buildSnapshot(
    { id: "p1", name: "Empty", slug: "e", sort_order: 0, cash_balance: 0 },
    [],
    {},
    {}
  );
  assert.equal(snap.totals.currentValue, 0);
  assert.equal(snap.totals.roiPct, 0);
  assert.equal(snap.totals.yield2wAvg, 0);

  const overview = buildOverview(
    [{ id: "p1", name: "Empty", slug: "e", sort_order: 0, cash_balance: Number.NaN }],
    [],
    {}
  );
  assert.equal(overview.totals.totalValue, 0);
  assert.equal(overview.totals.roiPct, 0);
  assert.equal(overview.totals.todayPct, null);
  assert.ok(Number.isFinite(overview.totals.cash));

  const fund = liveFundTotalValue({
    cash: 100,
    holdings: [{ ticker: "X", shares: 2, cost_basis: 10 }],
    quotes: { X: { price: Number.NaN } },
  });
  assert.equal(fund, 120);

  const conc = concentrationRead([]);
  assert.equal(conc.effectivePositions, 0);
  assert.equal(conc.topWeightPct, 0);
  assert.deepEqual(themeBreakdown([]), []);

  const shock = analyzePortfolioShock(
    [{ ticker: "AAA", shares: 10, price: 10 }],
    -100,
    "broad_down15"
  );
  assert.ok(Number.isFinite(shock.margin.shockedLeverage));
  assert.ok(Number.isFinite(shock.deltaPct));
  assert.notEqual(shock.margin.shockedLeverage, Number.POSITIVE_INFINITY);

  const ear = effectiveAnnualRate(-0.05, "monthly");
  assert.ok(ear < 0);
  assert.ok(Number.isFinite(ear));
  const compound = calculateCompound({
    principal: 0,
    ratePercent: Number.NaN,
    ratePeriod: "annual",
    compound: "monthly",
    years: 10,
    months: 0,
    contributionMode: "none",
    depositAmount: 0,
    depositFrequency: "monthly",
    withdrawalAmount: 0,
    withdrawalFrequency: "monthly",
    increaseMode: "percent",
    annualIncrease: 0,
  });
  assert.ok(Number.isFinite(compound.futureValue));
  assert.ok(Number.isFinite(compound.allTimeRoR));

  assert.equal(priorPriceFromChange(10, -100), 10);
  assert.ok(synthesizeSparkline(10, -100).every(Number.isFinite));
  assert.equal(percent(0.1 + 0.2), "30.0%");
  assert.equal(signedPercent(0.123), "+12.3%");
  assert.equal(percent(Number.POSITIVE_INFINITY), "—");
});

run("holdings writes are scoped to the portfolio they were cleared for", () => {
  const src = code(
    readFileSync(join(process.cwd(), "src/app/api/holdings/route.ts"), "utf8")
  );
  // Authorization for an existing row must come from that row. Falling back to
  // a client-supplied portfolio id (`row?.portfolio_id ?? body.portfolio_id`)
  // let a failed lookup authorize against whatever the caller named, and
  // getSupabaseDataClient() is the service-role client in production, so RLS is
  // not there to catch it. POST naming a portfolio for a brand-new holding is
  // fine — it is ownership-checked directly.
  assert.ok(
    !/\?\?\s*\(?\s*body\.portfolio_id/.test(src),
    "an existing holding's portfolio must not fall back to request input"
  );
  // The lookup that decides ownership has to fail closed, not treat an error
  // as "no such row".
  assert.ok(
    /if \(error\)/.test(src) && /status: 503/.test(src),
    "a failed holding lookup must fail closed"
  );
  // Both row-level writes must also filter on portfolio_id, so the rows the
  // ownership check cleared and the rows the write touches are the same set.
  const scopedWrites = src.match(/\.eq\("portfolio_id", portfolioId\)/g) ?? [];
  assert.ok(
    scopedWrites.length >= 2,
    `expected update and delete to be portfolio-scoped, found ${scopedWrites.length}`
  );
});

run("cash deltas are applied in one atomic statement", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/cash-trade.ts"), "utf8");
  assert.ok(
    /portfell_apply_cash_delta/.test(src),
    "cash moves must go through the atomic RPC, not a read-modify-write"
  );
  assert.ok(
    !/falling back to read-modify-write/.test(src),
    "a failed RPC must fail closed, not fall back to a racy write"
  );
  const migration = readFileSync(
    join(process.cwd(), "supabase/migrations/041_atomic_cash_delta.sql"),
    "utf8"
  );
  assert.ok(
    /cash_balance = round\([\s\S]{0,120}coalesce\(cash_balance, 0\)/.test(
      migration
    ),
    "the RPC must add the delta to the stored value inside the UPDATE"
  );
  // Round the delta, not the running total. Postgres round() breaks ties away
  // from zero, so rounding the balance after each add compounds: +100.005 then
  // -100.005 stored 100.01 and then 0.01 instead of returning to 0.
  assert.ok(
    /round\(p_delta::numeric, 2\)/.test(migration),
    "the delta must be rounded before it is added, or cents accumulate"
  );
  // Supabase default-grants execute on new public functions to anon, so
  // revoking from PUBLIC alone leaves anon holding it. It has to be named.
  assert.ok(
    /revoke all on function public\.portfell_apply_cash_delta[\s\S]{0,80}from anon/.test(
      migration
    ),
    "anon must be revoked by name, not just via PUBLIC"
  );
  assert.ok(
    !/grant execute[^;]*to anon/i.test(migration),
    "the cash RPC must never be granted to anon"
  );
  // It takes a portfolio id and an arbitrary amount, so without its own check
  // any caller reaching PostgREST could move any sheet's cash given a UUID.
  assert.ok(
    /portfell_is_portfolio_co_owner\(p_portfolio_id\)/.test(migration),
    "the cash RPC must verify co-ownership itself, not trust its callers"
  );
});

run("browser-only caches are not read during render", () => {
  // /communities and /communities/[id] have no auth gate in front of them, so
  // they really are prerendered and hydrated. Seeding state from localStorage
  // or window.location during render makes the server and client trees
  // disagree, and React throws the server HTML away — the opposite of what
  // the cache was for.
  const files = [
    "src/components/CommunitiesList.tsx",
    "src/components/CommunityView.tsx",
    "src/components/WatchlistStrip.tsx",
    "src/components/DailyDuelCard.tsx",
    "src/components/HomeWorld.tsx",
    "src/components/LabSheet.tsx",
    "src/components/Dashboard.tsx",
  ];
  const offenders: string[] = [];
  for (const file of files) {
    const src = code(readFileSync(join(process.cwd(), file), "utf8"));
    // `useState<Foo[]>(() => loadThing())` and `useState(readThing(id))` both
    // count; the generic argument is optional, so the pattern has to allow it.
    if (/useState(?:<[^>]*>)?\(\s*(?:\(\)\s*=>\s*)?(?:load|read)[A-Z]/.test(src)) {
      offenders.push(`${file}: useState seeded from a cache read`);
    }
    if (/useState(?:<[^>]*>)?\([^;]{0,240}new URLSearchParams\(window/.test(src)) {
      offenders.push(`${file}: useState seeded from window.location`);
    }
    if (/useRef\(\s*(?:load|read)[A-Z]/.test(src)) {
      offenders.push(`${file}: useRef seeded from a cache read`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join("; "));
});

run("nightly NAV history reads the newest nights, bounded by retention", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/api/book/nav-history/route.ts"),
    "utf8"
  );
  // Ascending + limit took the *oldest* rows. One nightly row covers every
  // user's book, so once retention passed the limit the chart would have
  // frozen on ancient history for everyone.
  assert.ok(
    /ascending: false/.test(src),
    "nightly history must read newest-first"
  );
  assert.ok(
    /limit\(NIGHTLY_SNAPSHOT_WINDOW\)/.test(src),
    "the window must track the retention constant, not a magic number"
  );
  assert.equal(NIGHTLY_SNAPSHOT_WINDOW, 14);
});

run("membership checks do not run one query per community", () => {
  const src = code(
    readFileSync(join(process.cwd(), "src/app/api/portfolios/route.ts"), "utf8")
  );
  assert.ok(
    !/Promise\.all\([^)]*userIsCommunityAdmin/.test(src),
    "mapping a per-row membership query over a list is an N+1"
  );
  assert.ok(/communityAdminFlags/.test(src));
});

run("dashboard modules sit behind an error boundary", () => {
  const dash = readFileSync(
    join(process.cwd(), "src/components/Dashboard.tsx"),
    "utf8"
  );
  for (const name of ["Pulse", "Lab", "Overview", "Holdings", "Forecast", "Margus"]) {
    assert.ok(
      dash.includes(`<WidgetErrorBoundary name="${name}">`),
      `Dashboard must isolate ${name}`
    );
  }
  const boundary = readFileSync(
    join(process.cwd(), "src/components/WidgetErrorBoundary.tsx"),
    "utf8"
  );
  assert.ok(/getDerivedStateFromError/.test(boundary));
  assert.ok(/Retry/.test(boundary));
  assert.ok(/resetKey/.test(boundary));
  const community = readFileSync(
    join(process.cwd(), "src/components/CommunityView.tsx"),
    "utf8"
  );
  assert.ok(community.includes(`<WidgetErrorBoundary name="Daily Duel"`));
  assert.ok(/WidgetErrorBoundary[\s\S]{0,80}name="Member book"/.test(community));
  const fund = readFileSync(
    join(process.cwd(), "src/components/UpsidePortfolioPage.tsx"),
    "utf8"
  );
  assert.ok(fund.includes(`<WidgetErrorBoundary name="Fund chart">`));
  const account = readFileSync(
    join(process.cwd(), "src/components/AccountPage.tsx"),
    "utf8"
  );
  assert.ok(account.includes(`<WidgetErrorBoundary name="Account">`));
});

run("workspace nav marks the current room and the skip link exists", () => {
  const switcher = readFileSync(
    join(process.cwd(), "src/components/WorkspaceSwitcher.tsx"),
    "utf8"
  );
  assert.ok(/aria-current=\{active \? "page"/.test(switcher));
  assert.ok(/bg-brand\/20 text-brand-bright/.test(switcher));
  const providers = readFileSync(
    join(process.cwd(), "src/components/Providers.tsx"),
    "utf8"
  );
  assert.ok(/href="#main"/.test(providers));
  assert.ok(/Skip to content/.test(providers));
  const dock = readFileSync(
    join(process.cwd(), "src/components/BookBottomNav.tsx"),
    "utf8"
  );
  assert.ok(/max-w-\[36rem\]/.test(dock));
});

run("holding and cash saves cannot double-fire", () => {
  const holding = readFileSync(
    join(process.cwd(), "src/components/HoldingModal.tsx"),
    "utf8"
  );
  const cash = readFileSync(
    join(process.cwd(), "src/components/CashModal.tsx"),
    "utf8"
  );
  assert.ok(/if \(busy\) return/.test(holding));
  assert.ok(/disabled=\{busy\}/.test(holding));
  assert.ok(/if \(busy\) return/.test(cash));
  assert.ok(/disabled=\{busy\}/.test(cash));
});

run("cash RPC still fails closed and money has a hard ceiling", () => {
  const money = readFileSync(join(process.cwd(), "src/lib/money.ts"), "utf8");
  assert.ok(/export const MAX_SAFE_MONEY/.test(money));
  assert.ok(/export const MAX_SAFE_SHARES/.test(money));
});

run("email and admin RPCs are not callable with a user JWT", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/043_rls_grants_oracles_initplan.sql"
    ),
    "utf8"
  );
  assert.ok(
    /revoke execute on function public\.portfell_lookup_profile_id_by_email\(text\)[\s\S]{0,40}from authenticated/.test(
      migration
    ),
    "lookup-by-email must not stay on authenticated"
  );
  assert.ok(
    /revoke execute on function public\.portfell_superadmin_overview\(\)[\s\S]{0,40}from authenticated/.test(
      migration
    ),
    "admin overview must not stay on authenticated"
  );
  assert.ok(
    /with check \(false\)/.test(migration),
    "error-log inserts must fail closed for JWT roles"
  );
  assert.ok(
    /revoke all on table public\.%I from anon/.test(migration),
    "anon must lose table grants, including TRUNCATE"
  );
  const ownership = readFileSync(
    join(process.cwd(), "src/lib/auth/ownership.ts"),
    "utf8"
  );
  assert.ok(
    /portfell_lookup_profile_id_by_email/.test(ownership),
    "co-owner add still goes through the service-role RPC"
  );
  const redeem = readFileSync(
    join(process.cwd(), "supabase/migrations/044_redeem_invite_rpcs.sql"),
    "utf8"
  );
  assert.ok(
    /create or replace function public\.portfell_redeem_community_invite/.test(
      redeem
    )
  );
  assert.ok(
    /create or replace function public\.portfell_redeem_portfolio_invite/.test(
      redeem
    )
  );
  assert.ok(
    /set accepted_at = now\(\)/.test(redeem),
    "redeem must claim the invite row in the same statement"
  );
  assert.ok(
    /revoke all on function public\.portfell_redeem_community_invite\(text\) from public, anon/.test(
      redeem
    )
  );
});

run("fund page does not read localStorage during render", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/UpsidePortfolioPage.tsx"),
    "utf8"
  );
  assert.ok(
    /useLayoutEffect\(\(\) => \{[\s\S]*loadUpsidePortfolioCache/.test(src),
    "fund cache must hydrate in a layout effect"
  );
  const beforeHook = src.slice(0, src.indexOf("useLayoutEffect(() => {"));
  assert.ok(
    !/loadUpsidePortfolioCache\(\)/.test(beforeHook),
    "loadUpsidePortfolioCache must not run during render"
  );
});

run("retry backoff drops the abort listener when the wait ends", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/abort.ts"), "utf8");
  assert.ok(/removeEventListener\("abort"/.test(src));
});

run("saved/copied flashes cannot setState after unmount", () => {
  const hook = readFileSync(
    join(process.cwd(), "src/lib/use-timeout.ts"),
    "utf8"
  );
  assert.ok(/ids\.current\.clear\(\)/.test(hook));
  const account = readFileSync(
    join(process.cwd(), "src/components/AccountPage.tsx"),
    "utf8"
  );
  assert.ok(/useTimeout\(\)/.test(account));
  assert.ok(!/setTimeout\(\(\) => setTierSaved/.test(account));
});

run("offline status is not read during render", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/use-online-status.ts"),
    "utf8"
  );
  assert.ok(/useState\(true\)/.test(src));
  assert.ok(/useLayoutEffect/.test(src));
  assert.ok(/navigator\.onLine/.test(src));
});

run("sign-in returns to the page you were on", () => {
  const auth = readFileSync(
    join(process.cwd(), "src/components/AuthProvider.tsx"),
    "utf8"
  );
  const site = readFileSync(join(process.cwd(), "src/lib/site-url.ts"), "utf8");
  assert.ok(
    /auth\/callback\?next=/.test(auth),
    "Google sign-in must pass the current path as next"
  );
  assert.ok(/function currentInternalNext/.test(site));
  assert.ok(/path\.startsWith\("\/auth\/"\)/.test(site));
});

run("pages reconnect after offline and back-forward cache", () => {
  const resume = readFileSync(
    join(process.cwd(), "src/lib/use-network-resume.ts"),
    "utf8"
  );
  assert.ok(/pageshow/.test(resume));
  assert.ok(/e\.persisted/.test(resume));
  const community = readFileSync(
    join(process.cwd(), "src/components/CommunityView.tsx"),
    "utf8"
  );
  assert.ok(/signal: ctrl\.signal/.test(community));
  assert.ok(/useNetworkResume/.test(community));
});

run("Lab market reads are shared per ticker, not fetched per visitor", () => {
  const trends = readFileSync(
    join(process.cwd(), "src/lib/market/trends-cache.ts"),
    "utf8"
  );
  const seasonality = readFileSync(
    join(process.cwd(), "src/lib/market/seasonality-fetch.ts"),
    "utf8"
  );
  const lab = readFileSync(
    join(process.cwd(), "src/components/LabSheet.tsx"),
    "utf8"
  );
  assert.ok(/unstable_cache/.test(trends));
  assert.ok(/trends-weekly-closes-v1/.test(trends));
  assert.ok(/trends-row-v1/.test(trends));
  assert.ok(/unstable_cache/.test(seasonality));
  assert.ok(/seasonality-model-v1/.test(seasonality));
  assert.ok(
    /tab === "trends"/.test(lab),
    "Trends should mount when that tab is open, not on every Lab visit"
  );
  assert.ok(/tab === "seasonality"/.test(lab));
});

if (failed > 0) {
  console.error(`\n${failed} invariant(s) failed`);
  process.exit(1);
}
console.log("\nall invariants passed");
