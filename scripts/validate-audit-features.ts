/**
 * Validation harness for audit feature libs (no browser).
 * Run: npx tsx scripts/validate-audit-features.ts
 */
import { allocationBySector, allocationByTicker } from "../src/lib/allocation";
import {
  buildEarningsAlerts,
  buildGoalAlert,
  buildStrikeAlerts,
} from "../src/lib/alerts";
import { shockedPrice, SHOCKS } from "../src/lib/book-shock";
import {
  captureSheetSnapshot,
  popUndoSnapshot,
  pushUndoSnapshot,
} from "../src/lib/book-undo";
import { trailingIncome, type CashflowEntry } from "../src/lib/cashflow";
import { correlationMatrix, pearson } from "../src/lib/correlation";
import {
  arenaValue,
  defaultArena,
  seedArenaFromLive,
} from "../src/lib/paper-arena";
import { estimateGreenStreak } from "../src/lib/streaks";
import { isForecastFullyCovered, FORECAST_YEARS } from "../src/lib/forecast";
import { ensureCompleteEoyTargets } from "../src/lib/forecast-plan";
import type { ForecastModel } from "../src/lib/forecast";
import { roundMoney, safeDiv } from "../src/lib/money";
import { enrichHoldings } from "../src/lib/calculations";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const slices = allocationBySector([
  { ticker: "NBIS", currentValue: 100 },
  { ticker: "RHM.DE", currentValue: 40 },
  { ticker: "VST", currentValue: 60 },
]);
assert(slices.length >= 2, "allocation sectors");
assert(
  Math.abs(slices.reduce((s, x) => s + x.pct, 0) - 1) < 1e-9,
  "alloc pct sum"
);

const byT = allocationByTicker(
  [
    { ticker: "A", currentValue: 90 },
    { ticker: "B", currentValue: 5 },
    { ticker: "C", currentValue: 5 },
  ],
  1
);
assert(byT.some((x) => x.label === "Other"), "ticker other bucket");

const strike = buildStrikeAlerts([
  { ticker: "X", spot: 110, stockTarget: 100, nextStrike: 120 },
]);
assert(strike.length >= 1, "strike alerts");

const earn = buildEarningsAlerts([
  { ticker: "X", date: "2026-08-12", days: 2 },
  { ticker: "Y", date: "2026-09-01", days: 20 },
]);
assert(earn.length === 1, "earnings window");

assert(buildGoalAlert(true, "Hit 100k"), "goal alert");
assert(Math.abs(shockedPrice("NBIS", 100, "ai_down20") - 80) < 1e-9, "ai shock nbis");
assert(Math.abs(shockedPrice("VST", 100, "ai_down20") - 83) < 1e-9, "ai shock vst");
assert(Math.abs(shockedPrice("PWR", 100, "ai_down20") - 84) < 1e-9, "ai shock pwr");
assert(Math.abs(shockedPrice("BMNR", 100, "btc_winter35") - 65) < 1e-9, "crypto bmnr");
assert(
  Math.abs(shockedPrice("NBIS", 100, "btc_winter35") - 82.5) < 1e-9,
  "crypto spill nbis"
);
assert(shockedPrice("SPY", 100, "btc_winter35") < 100, "crypto hits index beta");
assert(SHOCKS.length >= 4, "shock catalog");

const stack = pushUndoSnapshot([], {
  label: "test",
  portfolioId: "p1",
  cashBalance: 1,
  holdings: [],
  eoyOverrides: {},
});
const popped = popUndoSnapshot(stack);
assert(popped.snap?.label === "test", "undo pop");

assert(roundMoney(0.1 + 0.2) === 0.3, "roundMoney 0.1+0.2");
assert(safeDiv(10, 0) === 0, "safeDiv zero den");
assert(safeDiv(Number.NaN, 5) === 0, "safeDiv nan");
const zeroBasis = enrichHoldings(
  [
    {
      id: "1",
      portfolio_id: "p",
      ticker: "X",
      shares: 10,
      buy_price: 0,
      eoy_target: null,
      target_call_pct: 0.1,
      stock_target_override: null,
      sort_order: 0,
    },
  ],
  { X: { ticker: "X", price: 5, currency: "USD" } as never },
  0
);
assert(zeroBasis[0]?.roiPct === 0, "zero cost basis roiPct");
assert(zeroBasis[0]?.roiDollar === 50, "zero cost basis pnl dollars");

assert(Math.abs((pearson([1, 2, 3, 4, 5, 6], [2, 3, 4, 5, 6, 7]) ?? 0) - 1) < 1e-6, "pearson");
assert(
  correlationMatrix([
    { ticker: "A", sparkline: [1, 2, 3, 4, 5, 6] },
    { ticker: "B", sparkline: [2, 3, 4, 5, 6, 7] },
  ]).length === 1,
  "corr matrix"
);

const cfs: CashflowEntry[] = [
  {
    id: "1",
    at: new Date().toISOString(),
    kind: "premium",
    amount: 25,
    note: "test",
  },
];
assert(trailingIncome(cfs) === 25, "cashflow trailing");

const arena = defaultArena();
assert(arenaValue(arena, {}) === 10_000, "arena cash");
const seeded = seedArenaFromLive(500, [
  {
    id: "h1",
    portfolio_id: "p",
    ticker: "NBIS",
    shares: 2,
    buy_price: 100,
    eoy_target: null,
    target_call_pct: 0.2,
    stock_target_override: null,
    sort_order: 1,
  },
]);
assert(seeded.holdings.length === 1, "arena seed");
assert(estimateGreenStreak([1, 2, 3, 4]).greenDays >= 3, "streak");

const forecastStub = {
  years: FORECAST_YEARS,
  rows: [
    {
      ticker: "NBIS",
      shares: 1,
      currentPrice: 100,
      currentValue: 100,
      eoyPrices: {
        2026: 100,
        2027: 100,
        2028: 100,
        2029: 100,
        2030: 100,
      },
      eoyValues: {
        2026: 100,
        2027: 100,
        2028: 100,
        2029: 100,
        2030: 100,
      },
      targetedYears: {
        2026: false,
        2027: false,
        2028: false,
        2029: false,
        2030: false,
      },
      gainPct: 0,
      hasTargets: false,
    },
  ],
  currentTotal: 100,
  eoyTotals: {
    2026: 100,
    2027: 100,
    2028: 100,
    2029: 100,
    2030: 100,
  },
  gainPct: 0,
} as ForecastModel;

const complete = ensureCompleteEoyTargets(
  forecastStub,
  [{ ticker: "NBIS", prices: { 2026: 120 } as never, rationale: "partial" }],
  "bullish"
);
assert(complete[0]?.prices?.[2030], "ensureComplete fills years");
assert(
  (complete[0]?.prices?.[2030] ?? 0) > 100 * 3,
  "bullish AI infra fill is multi-bagger"
);
// Timid model path (classic 182 bug) must be rejected on BASE
const timidRejected = ensureCompleteEoyTargets(
  forecastStub,
  [
    {
      ticker: "NBIS",
      prices: {
        2026: 182,
        2027: 210,
        2028: 380,
        2029: 620,
        2030: 950,
      },
      rationale: "bad",
    },
  ],
  "base"
);
assert(
  (timidRejected[0]?.prices?.[2026] ?? 0) > 100 * 1.2,
  "base rejects NBIS EOY2026 below sheet floor"
);
const cryptoFill = ensureCompleteEoyTargets(
  {
    ...forecastStub,
    rows: [
      {
        ...forecastStub.rows[0]!,
        ticker: "BMNR",
        currentPrice: 20,
        currentValue: 20,
      },
    ],
  },
  [],
  "bullish"
);
const cPrices = cryptoFill[0]!.prices;
assert(
  cPrices[2028]! < cPrices[2027]!,
  "crypto fallback has a winter year"
);
assert(!isForecastFullyCovered(["NBIS"], {}), "coverage empty");
assert(
  isForecastFullyCovered(["NBIS"], {
    NBIS: { 2026: 1, 2027: 1, 2028: 1, 2029: 1, 2030: 1 },
  }),
  "coverage full"
);

const snap = captureSheetSnapshot({
  label: "cap",
  portfolio: {
    id: "p",
    name: "T",
    slug: "t",
    sort_order: 0,
    cash_balance: 0,
  },
  holdings: [],
  eoyOverrides: {},
});
assert(snap.portfolioId === "p", "capture");

console.log("validate-audit-features: ALL PASSED");
