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
import { reconcilePulseCheck, statusLabel, type PulseCheck } from "../src/lib/thesis-pulse";
import { humanizeMargusTree, humanizeMargusText } from "../src/lib/ai/humanize-copy";
import { LAB_TAB_ID, PULSE_TAB_ID } from "../src/lib/overview";
import { shouldHideOptions, TIER_HIDDEN_META_TABS } from "../src/lib/experience-tier";
import { sessionMark } from "../src/lib/market-session";
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
  assert.ok(world.includes("Around Upside"));
  assert.ok(world.includes("Upside Fund"));
  assert.ok(world.includes("Communities"));
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
  const pollers = ["Dashboard.tsx", "UpsidePortfolioPage.tsx", "MacroStrip.tsx"];
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

run("one product sentence on sign-in, not a fund pitch", () => {
  const product = readFileSync(
    join(process.cwd(), "src/lib/product.ts"),
    "utf8"
  );
  assert.match(product, /A daily read of your book/);
  const gate = readFileSync(
    join(process.cwd(), "src/components/SignInGate.tsx"),
    "utf8"
  );
  assert.match(gate, /PRODUCT_SENTENCE/);
  assert.doesNotMatch(gate, /\$50k|AI manage/);
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

if (failed > 0) {
  console.error(`\n${failed} invariant(s) failed`);
  process.exit(1);
}
console.log("\nall invariants passed");
