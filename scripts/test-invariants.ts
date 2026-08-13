/**
 * Product invariants from the Aug 2026 review.
 * Run: npx tsx scripts/test-invariants.ts
 */
import assert from "node:assert/strict";
import { buildInvestorBriefing } from "../src/lib/investor-briefing";
import { reconcilePulseCheck, type PulseCheck } from "../src/lib/thesis-pulse";
import { LAB_TAB_ID, PULSE_TAB_ID } from "../src/lib/overview";
import { TIER_HIDDEN_META_TABS } from "../src/lib/experience-tier";
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
  assert.ok(day?.cta?.toLowerCase().includes("pulse"));
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

run("broken + add becomes watch", () => {
  const next = reconcilePulseCheck(
    check({ thesisStatus: "broken", action: "add" })
  );
  assert.equal(next.thesisStatus, "watch");
});

run("novice hides Lab, not Pulse", () => {
  assert.ok(TIER_HIDDEN_META_TABS.novice.includes(LAB_TAB_ID));
  assert.ok(!TIER_HIDDEN_META_TABS.novice.includes(PULSE_TAB_ID));
});

if (failed > 0) {
  console.error(`\n${failed} invariant(s) failed`);
  process.exit(1);
}
console.log("\nall invariants passed");
