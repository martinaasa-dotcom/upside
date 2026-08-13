/**
 * Edge-case guard for the pure calculation layer.
 *
 * Feeds every money/percentage function the inputs real users actually
 * produce (empty book on day one, a single name, a gifted share with no
 * cost basis, a short showing as a negative value, a position that went to
 * zero, a 0% or negative growth rate, a withdrawal larger than the
 * balance) and fails on anything non-finite, out of its documented range,
 * or negative where it can't be.
 *
 * This caught allocation slices rendering as 105% and -5% when a book held
 * a negative position, which the UI turned into a negative CSS bar width.
 *
 * Run: npm run check:edges
 */
const problems: string[] = [];

/* eslint-disable @typescript-eslint/no-explicit-any -- assertions here
   deliberately probe values the types claim are impossible; that's the
   whole point of the harness. */
type Predicate = (v: any) => boolean;

function check(
  label: string,
  value: unknown,
  predicate: Predicate,
  expectation: string
) {
  if (!predicate(value)) {
    problems.push(
      `${label}: got ${JSON.stringify(value)}, expected ${expectation}`
    );
  }
}
const finite: Predicate = (v) => typeof v === "number" && Number.isFinite(v);
const inRange =
  (lo: number, hi: number): Predicate =>
  (v) =>
    finite(v) && v >= lo && v <= hi;

const { concentrationRead, themeBreakdown, allocationBySector, allocationByTicker } =
  await import("@/lib/allocation");
const { buildPortfolioPersonality } = await import("@/lib/portfolio-personality");

const CASES = {
  empty: [],
  single: [{ ticker: "NVDA", currentValue: 10000 }],
  zeroValue: [{ ticker: "NVDA", currentValue: 0 }],
  allZero: [
    { ticker: "NVDA", currentValue: 0 },
    { ticker: "AMD", currentValue: 0 },
  ],
  negative: [{ ticker: "NVDA", currentValue: -500 }],
  mixedNegative: [
    { ticker: "NVDA", currentValue: 10000 },
    { ticker: "AMD", currentValue: -500 },
  ],
  tiny: [
    { ticker: "NVDA", currentValue: 0.00001 },
    { ticker: "AMD", currentValue: 0.00001 },
  ],
  huge: [
    { ticker: "NVDA", currentValue: 1e12 },
    { ticker: "AMD", currentValue: 1 },
  ],
  unknownTicker: [{ ticker: "ZZZZQQ", currentValue: 5000 }],
  many: Array.from({ length: 60 }, (_, i) => ({
    ticker: `T${i}`,
    currentValue: 1000,
  })),
};

for (const [name, holdings] of Object.entries(CASES)) {
  const c = concentrationRead(holdings);
  check(`concentrationRead(${name}).effectivePositions`, c.effectivePositions, finite, "finite");
  check(`concentrationRead(${name}).topWeightPct`, c.topWeightPct, inRange(0, 1), "0..1");
  check(`concentrationRead(${name}).topFivePct`, c.topFivePct, inRange(0, 1), "0..1");
  check(`concentrationRead(${name}).positionCount`, c.positionCount, (v) => Number.isInteger(v) && v >= 0, "int >= 0");

  const themes = themeBreakdown(holdings);
  const sum = themes.reduce((s, t) => s + t.pct, 0);
  check(
    `themeBreakdown(${name}) pct sum`,
    Number(sum.toFixed(6)),
    (v) => themes.length === 0 ? v === 0 : Math.abs(v - 1) < 1e-6,
    "0 (empty) or 1"
  );
  for (const t of themes) {
    check(`themeBreakdown(${name}).${t.theme}.pct`, t.pct, inRange(0, 1), "0..1");
    check(`themeBreakdown(${name}).${t.theme}.label`, t.label, (v) => typeof v === "string" && v.length > 0, "non-empty label");
  }

  const allocFns: [string, typeof allocationBySector][] = [
    ["allocationBySector", allocationBySector],
    ["allocationByTicker", allocationByTicker],
  ];
  for (const [fnName, fn] of allocFns) {
    for (const s of fn(holdings)) {
      check(`${fnName}(${name}).${s.label}.pct`, s.pct, inRange(0, 1), "0..1");
      check(`${fnName}(${name}).${s.label}.value`, s.value, finite, "finite");
    }
  }

  const p = buildPortfolioPersonality(holdings.map((h) => ({ ticker: h.ticker, value: h.currentValue })));
  check(`personality(${name}).diversificationScore`, p.diversificationScore, inRange(0, 100), "0..100");
  check(`personality(${name}).riskScore`, p.riskScore, inRange(0, 100), "0..100");
  check(`personality(${name}).expectedAnnualReturnPct`, p.expectedAnnualReturnPct, finite, "finite");
  check(`personality(${name}).maxDrawdownPct`, p.maxDrawdownPct, inRange(0, 100), "0..100");
  check(`personality(${name}).modeledAlphaPct`, p.modeledAlphaPct, finite, "finite");
  check(`personality(${name}).animal`, p.animal, (v) => typeof v === "string" && v.length > 0, "an animal");
  check(`personality(${name}).tagline`, p.tagline, (v) => typeof v === "string" && !v.includes("undefined") && !v.includes("NaN"), "clean tagline");
}

// --- Compound engine ------------------------------------------------------
const { calculateCompound, DEFAULT_COMPOUND_INPUTS, timeToDouble } =
  await import("@/lib/compound-interest");

const COMPOUND_CASES: Record<string, Partial<typeof DEFAULT_COMPOUND_INPUTS>> = {
  defaults: {},
  zeroYears: { years: 0, months: 0 },
  zeroRate: { ratePercent: 0 },
  negativeRate: { ratePercent: -8 },
  zeroPrincipal: { principal: 0 },
  negativePrincipal: { principal: -1000 },
  hugeRate: { ratePercent: 500 },
  hugeHorizon: { years: 100 },
  withdrawMoreThanBalance: {
    principal: 100,
    contributionMode: "withdrawals",
    withdrawalAmount: 100000,
  },
  bigAnnualIncrease: { annualIncrease: 1000 },
  fractionalMonths: { years: 0, months: 7 },
};

for (const [name, patch] of Object.entries(COMPOUND_CASES)) {
  const inputs = { ...DEFAULT_COMPOUND_INPUTS, ...patch };
  let r;
  try {
    r = calculateCompound(inputs);
  } catch (e) {
    problems.push(`calculateCompound(${name}) threw: ${(e as Error).message}`);
    continue;
  }
  check(`compound(${name}).futureValue`, r.futureValue, finite, "finite");
  check(`compound(${name}).totalInterest`, r.totalInterest, finite, "finite");
  check(`compound(${name}).allTimeRoR`, r.allTimeRoR, finite, "finite");
  check(`compound(${name}).effectiveAnnualRate`, r.effectiveAnnualRate, finite, "finite");
  // Never-doubles (0% or negative) legitimately yields Infinity here; the
  // Compound sheet guards it with Number.isFinite and prints a dash.
  check(
    `compound(${name}).doubleYears`,
    r.doubleYears,
    (v) => finite(v) || v === Infinity || v === null,
    "finite, or Infinity/null meaning never"
  );
  for (const seriesName of ["yearly", "monthly"] as const) {
    const rows = r[seriesName];
    check(
      `compound(${name}).${seriesName} all finite`,
      Array.isArray(rows) &&
        rows.every(
          (row) =>
            finite(row.interest) &&
            finite(row.accruedInterest) &&
            finite(row.balance)
        ),
      (v) => v === true,
      "every row finite"
    );
    check(
      `compound(${name}).${seriesName} no negative balance`,
      Array.isArray(rows) && rows.every((row) => row.balance >= -1e-6),
      (v) => v === true,
      "no negative balances"
    );
  }
}

// annualRate here is a decimal (0.07 = 7%), not a percent.
for (const [label, rate] of [["zero", 0], ["negative", -0.05], ["normal", 0.07]] as const) {
  const d = timeToDouble(rate, "monthly");
  check(
    `timeToDouble(${label})`,
    d,
    (v) =>
      v != null &&
      !Number.isNaN(v.years) &&
      !Number.isNaN(v.months) &&
      Number.isFinite(v.months),
    "never NaN (Infinity years is the legitimate 'never' sentinel)"
  );
}

// --- Correlation ----------------------------------------------------------
const { pearson } = await import("@/lib/correlation");
const CORR_CASES: Record<string, [number[], number[]]> = {
  identical: [[1, 2, 3, 4], [1, 2, 3, 4]],
  inverse: [[1, 2, 3, 4], [4, 3, 2, 1]],
  flatA: [[5, 5, 5, 5], [1, 2, 3, 4]],
  bothFlat: [[5, 5, 5, 5], [5, 5, 5, 5]],
  empty: [[], []],
  singlePoint: [[1], [1]],
  mismatchedLength: [[1, 2, 3], [1, 2]],
};
for (const [name, [a, b]] of Object.entries(CORR_CASES)) {
  const r = pearson(a, b);
  check(
    `pearson(${name})`,
    r,
    (v) => v === null || (finite(v) && v >= -1.0000001 && v <= 1.0000001),
    "null or -1..1"
  );
}

// --- Shock ----------------------------------------------------------------
const { SHOCKS, shockedPrice, shockedPct } = await import("@/lib/book-shock");
for (const s of SHOCKS) {
  for (const [label, spot] of [["normal", 100], ["zero", 0], ["tiny", 0.0001], ["negative", -5]] as const) {
    for (const ticker of ["NVDA", "ZZZZQQ"]) {
      const sp = shockedPrice(ticker, spot, s.id);
      check(
        `shockedPrice(${ticker},${s.id},${label})`,
        sp,
        (v) => finite(v),
        "finite"
      );
    }
  }
  check(`shockedPct(${s.id})`, shockedPct("ZZZZQQ", s.id), finite, "finite");
}

// Every formatter is the last line of defence before a bad number reaches
// the screen, so all of them must degrade to a dash rather than printing
// "$∞", "Infinity%" or "$NaN".
const { currency, percent, number, signedCurrency } = await import("@/lib/format");
const formatters: [string, (v: number | null | undefined) => string][] = [
  ["currency", currency],
  ["percent", percent],
  ["number", number],
  ["signedCurrency", signedCurrency],
];
for (const bad of [NaN, Infinity, -Infinity, null, undefined]) {
  for (const [fname, fn] of formatters) {
    check(
      `${fname}(${String(bad)})`,
      fn(bad),
      (v) => v === "—",
      "an em-dash placeholder"
    );
  }
}

if (problems.length === 0) {
  console.log("PASS: no edge-case problems found");
} else {
  console.error(`FAIL: ${problems.length} edge-case problem(s):`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
